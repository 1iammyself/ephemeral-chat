package me.kyere.chat;

import android.Manifest;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.nsd.*;
import android.net.wifi.*;
import android.net.wifi.p2p.*;
import android.os.*;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

import org.json.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * ProximityPlugin — True offline P2P peer discovery and WebRTC SDP exchange
 *
 * Discovery channels (all active simultaneously when available):
 *   1. NSD / mDNS     — same WiFi LAN  (NsdManager, _ephchat._tcp.)
 *   2. BLE advertising — works offline  (BluetoothLeAdvertiser + Scanner)
 *   3. BLE GATT        — SDP exchange over BLE when no shared IP network
 *   4. Wi-Fi Direct    — creates ad-hoc network, truly offline P2P
 *
 * SDP exchange (for WebRTC without a signaling server):
 *   Local HTTP server (random port) accepts POST /sdp/{fromDeviceId}
 *   and fires offlineSdpReceived event to JS.
 */
@CapacitorPlugin(
    name = "Proximity",
    permissions = {
        @Permission(alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "wifi",
            strings = { Manifest.permission.ACCESS_WIFI_STATE, Manifest.permission.CHANGE_WIFI_STATE }),
        @Permission(alias = "bluetooth",
            strings = { Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN })
    }
)
@SuppressWarnings({ "deprecation", "MissingPermission" })
public class ProximityPlugin extends Plugin {

    private static final String TAG             = "ProximityPlugin";
    private static final int    PERM_CODE       = 9001;
    private static final int    PERM_CODE_BT    = 9002;

    // mDNS service type + prefix
    private static final String NSD_SERVICE_TYPE = "_ephchat._tcp.";
    private static final String NSD_SERVICE_PREFIX = "EphemeralChat-";

    // BLE identifiers (must match electron-app/mdns-server.js and web-ble constants)
    private static final UUID BLE_SERVICE_UUID = UUID.fromString("12345678-1234-1234-1234-123456789abc");
    private static final UUID BLE_CHAR_UUID    = UUID.fromString("12345678-1234-1234-1234-123456789abd");
    private static final int  BLE_MFG_ID       = 0x1234;

    // ─── System services ─────────────────────────────────────────────────────

    private WifiManager      wifiManager;
    private WifiP2pManager   wifiP2pManager;
    private WifiP2pManager.Channel p2pChannel;
    private NsdManager       nsdManager;
    private BluetoothManager bluetoothManager;

    // ─── BLE ─────────────────────────────────────────────────────────────────

    private BluetoothLeAdvertiser bleAdvertiser;
    private BluetoothLeScanner    bleScanner;
    private ScanCallback          bleScanCallback;
    private AdvertiseCallback     bleAdvCallback;
    private BluetoothGattServer   gattServer;

    // ─── NSD ─────────────────────────────────────────────────────────────────

    private NsdManager.RegistrationListener nsdRegListener;
    private NsdManager.DiscoveryListener    nsdDiscListener;

    // ─── Wi-Fi Direct ────────────────────────────────────────────────────────

    private BroadcastReceiver p2pReceiver;
    private boolean           isP2pDiscovering = false;

    // ─── Hotspot ─────────────────────────────────────────────────────────────

    private WifiManager.LocalOnlyHotspotReservation hotspotReservation;

    // ─── SDP HTTP server ─────────────────────────────────────────────────────

    private ServerSocket      sdpServerSocket;
    private Thread            sdpServerThread;
    private int               sdpServerPort   = 0;
    private final AtomicBoolean sdpRunning     = new AtomicBoolean(false);

    // ─── Peer registry ───────────────────────────────────────────────────────

    private final Map<String, JSONObject> nsdPeers = new ConcurrentHashMap<>();
    private final Map<String, JSONObject> blePeers = new ConcurrentHashMap<>();

    // ─── Identity ────────────────────────────────────────────────────────────

    private String myDeviceId;
    private String myNickname;

    private final ExecutorService executor = Executors.newCachedThreadPool();

    // ─── load ────────────────────────────────────────────────────────────────

    @Override
    public void load() {
        super.load();
        wifiManager      = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        wifiP2pManager   = (WifiP2pManager) getContext().getApplicationContext().getSystemService(Context.WIFI_P2P_SERVICE);
        nsdManager       = (NsdManager) getContext().getApplicationContext().getSystemService(Context.NSD_SERVICE);
        bluetoothManager = (BluetoothManager) getContext().getApplicationContext().getSystemService(Context.BLUETOOTH_SERVICE);

        if (wifiP2pManager != null) {
            p2pChannel = wifiP2pManager.initialize(getContext(), getContext().getMainLooper(), null);
        }

        myDeviceId = android.provider.Settings.Secure.getString(
                getContext().getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        if (myDeviceId == null) myDeviceId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        myNickname = Build.MODEL;

        Log.i(TAG, "ProximityPlugin loaded — deviceId=" + myDeviceId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Identity
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void getDeviceId(PluginCall call) {
        JSObject r = new JSObject();
        r.put("deviceId", myDeviceId);
        call.resolve(r);
    }

    @PluginMethod
    public void setNickname(PluginCall call) {
        String n = call.getString("nickname");
        if (n != null && !n.isEmpty()) myNickname = n;
        JSObject r = new JSObject();
        r.put("success", true);
        call.resolve(r);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Local SDP HTTP server
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void startSdpServer(PluginCall call) {
        if (sdpRunning.get()) {
            JSObject r = new JSObject();
            r.put("success", true);
            r.put("port", sdpServerPort);
            call.resolve(r);
            return;
        }
        executor.execute(() -> {
            try {
                sdpServerSocket = new ServerSocket(0);     // OS picks free port
                sdpServerPort   = sdpServerSocket.getLocalPort();
                sdpRunning.set(true);
                Log.i(TAG, "[SDP] Server on port " + sdpServerPort);

                JSObject r = new JSObject();
                r.put("success", true);
                r.put("port", sdpServerPort);
                call.resolve(r);

                sdpServerThread = new Thread(() -> {
                    while (sdpRunning.get() && !sdpServerSocket.isClosed()) {
                        try {
                            Socket client = sdpServerSocket.accept();
                            executor.execute(() -> handleSdpClient(client));
                        } catch (IOException e) {
                            if (sdpRunning.get()) Log.w(TAG, "[SDP] Accept: " + e.getMessage());
                        }
                    }
                });
                sdpServerThread.setDaemon(true);
                sdpServerThread.start();

            } catch (IOException e) {
                Log.e(TAG, "[SDP] Start failed: " + e.getMessage());
                JSObject r = new JSObject();
                r.put("success", false);
                r.put("error", e.getMessage());
                call.resolve(r);
            }
        });
    }

    private void handleSdpClient(Socket client) {
        try {
            BufferedReader  reader = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            PrintWriter     writer = new PrintWriter(new BufferedWriter(new OutputStreamWriter(client.getOutputStream())), true);

            String requestLine = reader.readLine();
            if (requestLine == null) { client.close(); return; }

            String[] parts  = requestLine.split(" ");
            String   method = parts.length > 0 ? parts[0] : "";
            String   path   = parts.length > 1 ? parts[1] : "";

            int contentLength = 0;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("content-length:")) {
                    try { contentLength = Integer.parseInt(line.substring(15).trim()); } catch (NumberFormatException ignored) {}
                }
            }

            String body = "";
            if ("POST".equals(method) && contentLength > 0) {
                char[] buf = new char[contentLength];
                int read = reader.read(buf, 0, contentLength);
                if (read > 0) body = new String(buf, 0, read);
            }

            if ("GET".equals(method) && "/ping".equals(path)) {
                String resp = "{\"deviceId\":\"" + myDeviceId + "\",\"port\":" + sdpServerPort + "}";
                writer.print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + resp.length() + "\r\n\r\n" + resp);
            } else if ("POST".equals(method) && path.startsWith("/sdp/")) {
                String fromId = path.substring(5);
                Log.i(TAG, "[SDP] Received from " + fromId);
                JSObject ev = new JSObject();
                ev.put("fromPeerId", fromId);
                ev.put("sdp", body);
                notifyListeners("offlineSdpReceived", ev);
                writer.print("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK");
            } else {
                writer.print("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
            }

            writer.flush();
            client.close();
        } catch (IOException e) {
            Log.w(TAG, "[SDP] Client error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopSdpServer(PluginCall call) {
        sdpRunning.set(false);
        try { if (sdpServerSocket != null) sdpServerSocket.close(); } catch (IOException ignored) {}
        sdpServerPort = 0;
        JSObject r = new JSObject();
        r.put("success", true);
        call.resolve(r);
    }

    @PluginMethod
    public void getSdpPort(PluginCall call) {
        JSObject r = new JSObject();
        r.put("port", sdpServerPort);
        r.put("running", sdpRunning.get());
        call.resolve(r);
    }

    /** Send our SDP to a peer's local HTTP server */
    @PluginMethod
    public void sendSdpToPeer(PluginCall call) {
        String peerIp   = call.getString("peerIp");
        int    peerPort = call.getInt("peerPort", 0);
        String sdp      = call.getString("sdp");
        String myId     = call.getString("myId", myDeviceId);

        if (peerIp == null || sdp == null || peerPort == 0) {
            call.reject("peerIp, peerPort, sdp required");
            return;
        }

        executor.execute(() -> {
            try {
                URL url = new URL("http://" + peerIp + ":" + peerPort + "/sdp/" + URLEncoder.encode(myId, "UTF-8"));
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5_000);
                conn.setReadTimeout(5_000);
                byte[] bodyBytes = sdp.getBytes(StandardCharsets.UTF_8);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Content-Length", String.valueOf(bodyBytes.length));
                try (OutputStream os = conn.getOutputStream()) { os.write(bodyBytes); }
                int status = conn.getResponseCode();
                conn.disconnect();
                JSObject r = new JSObject();
                r.put("success", status == 200);
                r.put("status", status);
                call.resolve(r);
            } catch (Exception e) {
                Log.e(TAG, "[SDP] Send failed: " + e.getMessage());
                JSObject r = new JSObject();
                r.put("success", false);
                r.put("error", e.getMessage());
                call.resolve(r);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NSD (mDNS) — LAN discovery
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void startNsd(PluginCall call) {
        String nickname = call.getString("nickname", myNickname);
        int    port     = call.getInt("port", sdpServerPort);

        if (port == 0) { call.reject("Start SDP server first (port=0)"); return; }

        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(NSD_SERVICE_PREFIX + myDeviceId);
        info.setServiceType(NSD_SERVICE_TYPE);
        info.setPort(port);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            info.setAttribute("deviceId", myDeviceId);
            info.setAttribute("nickname", nickname.substring(0, Math.min(nickname.length(), 30)));
            info.setAttribute("platform", "android");
            info.setAttribute("port", String.valueOf(port));
            info.setAttribute("ip", getLocalIpAddress() != null ? getLocalIpAddress() : "");
        }

        nsdRegListener = new NsdManager.RegistrationListener() {
            @Override public void onRegistrationFailed(NsdServiceInfo i, int c) { Log.e(TAG, "[NSD] Reg failed: " + c); }
            @Override public void onUnregistrationFailed(NsdServiceInfo i, int c) {}
            @Override public void onServiceRegistered(NsdServiceInfo i) {
                Log.i(TAG, "[NSD] Registered: " + i.getServiceName());
            }
            @Override public void onServiceUnregistered(NsdServiceInfo i) {}
        };

        try { nsdManager.registerService(info, NsdManager.PROTOCOL_DNS_SD, nsdRegListener); }
        catch (Exception e) { call.reject("NSD register: " + e.getMessage()); return; }

        startNsdDiscovery();

        JSObject r = new JSObject();
        r.put("success", true);
        call.resolve(r);
    }

    private void startNsdDiscovery() {
        nsdDiscListener = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String t) { Log.i(TAG, "[NSD] Discovery started"); }
            @Override public void onDiscoveryStopped(String t) {}
            @Override public void onStartDiscoveryFailed(String t, int c) { Log.e(TAG, "[NSD] Discovery failed: " + c); }
            @Override public void onStopDiscoveryFailed(String t, int c) {}

            @Override
            public void onServiceFound(NsdServiceInfo service) {
                if (!service.getServiceName().startsWith(NSD_SERVICE_PREFIX)) return;
                nsdManager.resolveService(service, new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo i, int c) {}
                    @Override
                    public void onServiceResolved(NsdServiceInfo i) {
                        try {
                            Map<String, byte[]> attrs = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
                                    ? i.getAttributes() : null;
                            String peerId   = attrs != null && attrs.get("deviceId") != null
                                    ? new String(attrs.get("deviceId"), StandardCharsets.UTF_8) : i.getServiceName();
                            if (peerId.equals(myDeviceId)) return;

                            String nick     = attrs != null && attrs.get("nickname") != null
                                    ? new String(attrs.get("nickname"), StandardCharsets.UTF_8) : peerId;
                            String attrIp   = attrs != null && attrs.get("ip") != null
                                    ? new String(attrs.get("ip"), StandardCharsets.UTF_8) : "";
                            String ip       = !attrIp.isEmpty() ? attrIp
                                    : (i.getHost() != null ? i.getHost().getHostAddress() : "");
                            int    port     = i.getPort();

                            if (ip.isEmpty() || port == 0) return;

                            JSONObject peer = new JSONObject();
                            peer.put("deviceId", peerId);
                            peer.put("nickname", nick);
                            peer.put("ip", ip);
                            peer.put("port", port);
                            peer.put("platform", "android");
                            peer.put("transport", "nsd");
                            nsdPeers.put(peerId, peer);

                            Log.i(TAG, "[NSD] Peer: " + nick + " @ " + ip + ":" + port);

                            JSObject ev = new JSObject();
                            ev.put("deviceId", peerId);
                            ev.put("nickname", nick);
                            ev.put("ip", ip);
                            ev.put("port", port);
                            ev.put("platform", "android");
                            ev.put("transport", "nsd");
                            notifyListeners("offlinePeerFound", ev);

                        } catch (Exception e) { Log.e(TAG, "[NSD] Resolve parse: " + e.getMessage()); }
                    }
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo service) {
                Log.i(TAG, "[NSD] Lost: " + service.getServiceName());
                String lostId = null;
                for (Map.Entry<String, JSONObject> e : nsdPeers.entrySet()) {
                    try {
                        if (service.getServiceName().contains(e.getValue().getString("deviceId"))) {
                            lostId = e.getKey(); break;
                        }
                    } catch (JSONException ignored) {}
                }
                if (lostId != null) {
                    nsdPeers.remove(lostId);
                    JSObject ev = new JSObject();
                    ev.put("deviceId", lostId);
                    notifyListeners("offlinePeerLost", ev);
                }
            }
        };

        try { nsdManager.discoverServices(NSD_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, nsdDiscListener); }
        catch (Exception e) { Log.e(TAG, "[NSD] discoverServices: " + e.getMessage()); }
    }

    @PluginMethod
    public void stopNsd(PluginCall call) {
        try { if (nsdDiscListener != null) nsdManager.stopServiceDiscovery(nsdDiscListener); } catch (Exception ignored) {}
        try { if (nsdRegListener  != null) nsdManager.unregisterService(nsdRegListener); }    catch (Exception ignored) {}
        nsdDiscListener = null;
        nsdRegListener  = null;
        nsdPeers.clear();
        JSObject r = new JSObject();
        r.put("success", true);
        call.resolve(r);
    }

    @PluginMethod
    public void getNsdPeers(PluginCall call) {
        JSArray arr = new JSArray();
        for (JSONObject p : nsdPeers.values()) arr.put(p);
        JSObject r = new JSObject();
        r.put("peers", arr);
        call.resolve(r);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLE advertising + scanning — offline peer discovery
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void startBleAdvertising(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            reject(call, "BLE advertising requires Android 5+"); return;
        }
        BluetoothAdapter adapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) {
            resolve(call, false, "Bluetooth not enabled"); return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_ADVERTISE")
                    != PackageManager.PERMISSION_GRANTED) {
                resolve(call, false, "BLUETOOTH_ADVERTISE permission required (Android 12+)"); return;
            }
        }
        bleAdvertiser = adapter.getBluetoothLeAdvertiser();
        if (bleAdvertiser == null) { resolve(call, false, "BLE advertiser not supported"); return; }

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setConnectable(true)
                .setTimeout(0)
                .build();

        // Embed first 8 chars of deviceId as manufacturer data
        byte[] mfgData = myDeviceId.substring(0, Math.min(8, myDeviceId.length()))
                .getBytes(StandardCharsets.UTF_8);

        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(new android.os.ParcelUuid(BLE_SERVICE_UUID))
                .addManufacturerData(BLE_MFG_ID, mfgData)
                .build();

        AdvertiseData scanResp = new AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build();

        bleAdvCallback = new AdvertiseCallback() {
            @Override public void onStartSuccess(AdvertiseSettings s) {
                Log.i(TAG, "[BLE] Advertising started");
                JSObject r = new JSObject();
                r.put("success", true);
                call.resolve(r);
            }
            @Override public void onStartFailure(int code) {
                Log.e(TAG, "[BLE] Advertise failed: " + code);
                resolve(call, false, "BLE advertise failed (code=" + code + ")");
            }
        };

        bleAdvertiser.startAdvertising(settings, data, scanResp, bleAdvCallback);
    }

    @PluginMethod
    public void stopBleAdvertising(PluginCall call) {
        if (bleAdvertiser != null && bleAdvCallback != null) {
            try { bleAdvertiser.stopAdvertising(bleAdvCallback); } catch (Exception ignored) {}
        }
        bleAdvertiser = null;
        bleAdvCallback = null;
        resolve(call, true, null);
    }

    @PluginMethod
    public void startBleScanning(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            reject(call, "BLE scanning requires Android 5+"); return;
        }
        BluetoothAdapter adapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) { resolve(call, false, "Bluetooth not enabled"); return; }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_SCAN")
                    != PackageManager.PERMISSION_GRANTED) {
                resolve(call, false, "BLUETOOTH_SCAN permission required"); return;
            }
        }

        bleScanner = adapter.getBluetoothLeScanner();
        if (bleScanner == null) { resolve(call, false, "BLE scanner not available"); return; }

        ScanFilter filter = new ScanFilter.Builder()
                .setServiceUuid(new android.os.ParcelUuid(BLE_SERVICE_UUID))
                .build();
        ScanSettings scanSettings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
                .build();

        final String myIdPrefix = myDeviceId.substring(0, Math.min(8, myDeviceId.length()));

        bleScanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, android.bluetooth.le.ScanResult result) {
                try {
                    ScanRecord   record = result.getScanRecord();
                    if (record == null) return;
                    byte[] mfg = record.getManufacturerSpecificData(BLE_MFG_ID);
                    if (mfg == null) return;
                    String peerId = new String(mfg, StandardCharsets.UTF_8);
                    if (peerId.equals(myIdPrefix)) return;              // our own advertisement
                    if (blePeers.containsKey(peerId)) return;           // already known

                    String deviceName = record.getDeviceName() != null
                            ? record.getDeviceName() : result.getDevice().getAddress();

                    JSONObject peer = new JSONObject();
                    peer.put("deviceId", peerId);
                    peer.put("nickname", deviceName);
                    peer.put("address", result.getDevice().getAddress());
                    peer.put("rssi", result.getRssi());
                    peer.put("transport", "ble");
                    peer.put("platform", "android");
                    blePeers.put(peerId, peer);

                    Log.i(TAG, "[BLE] Peer found: " + deviceName + " rssi=" + result.getRssi());

                    JSObject ev = new JSObject();
                    ev.put("deviceId", peerId);
                    ev.put("nickname", deviceName);
                    ev.put("address", result.getDevice().getAddress());
                    ev.put("rssi", result.getRssi());
                    ev.put("transport", "ble");
                    ev.put("platform", "android");
                    notifyListeners("offlinePeerFound", ev);

                } catch (Exception e) { Log.e(TAG, "[BLE] Scan result: " + e.getMessage()); }
            }
            @Override public void onScanFailed(int code) { Log.e(TAG, "[BLE] Scan failed: " + code); }
        };

        try {
            bleScanner.startScan(Collections.singletonList(filter), scanSettings, bleScanCallback);
            resolve(call, true, null);
        } catch (Exception e) {
            resolve(call, false, e.getMessage());
        }
    }

    @PluginMethod
    public void stopBleScanning(PluginCall call) {
        if (bleScanner != null && bleScanCallback != null) {
            try { bleScanner.stopScan(bleScanCallback); } catch (Exception ignored) {}
        }
        bleScanCallback = null;
        blePeers.clear();
        resolve(call, true, null);
    }

    @PluginMethod
    public void getBlePeers(PluginCall call) {
        JSArray arr = new JSArray();
        for (JSONObject p : blePeers.values()) arr.put(p);
        JSObject r = new JSObject();
        r.put("peers", arr);
        call.resolve(r);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GATT server — SDP exchange over BLE (when no shared IP network)
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void startGattServer(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) { reject(call, "GATT needs Android 5+"); return; }
        BluetoothAdapter adapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) { resolve(call, false, "Bluetooth not enabled"); return; }

        // Single-value buffer: last SDP we want to offer via READ
        final StringBuilder localSdpBuffer = new StringBuilder();

        BluetoothGattCharacteristic characteristic = new BluetoothGattCharacteristic(
                BLE_CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ
                        | BluetoothGattCharacteristic.PROPERTY_WRITE
                        | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ | BluetoothGattCharacteristic.PERMISSION_WRITE);

        BluetoothGattService service = new BluetoothGattService(BLE_SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);
        service.addCharacteristic(characteristic);

        gattServer = bluetoothManager.openGattServer(getContext(), new BluetoothGattServerCallback() {
            @Override public void onConnectionStateChange(BluetoothDevice d, int status, int newState) {
                Log.i(TAG, "[GATT] " + d.getAddress() + " → " + (newState == BluetoothProfile.STATE_CONNECTED ? "connected" : "disconnected"));
            }

            @Override
            public void onCharacteristicReadRequest(BluetoothDevice d, int reqId, int offset, BluetoothGattCharacteristic ch) {
                // Peer is reading our queued SDP offer
                byte[] val = localSdpBuffer.length() > 0
                        ? localSdpBuffer.toString().getBytes(StandardCharsets.UTF_8) : new byte[0];
                gattServer.sendResponse(d, reqId, BluetoothGatt.GATT_SUCCESS, offset, val);
            }

            @Override
            public void onCharacteristicWriteRequest(BluetoothDevice d, int reqId,
                    BluetoothGattCharacteristic ch, boolean prepared, boolean responseNeeded,
                    int offset, byte[] value) {
                // Peer is writing their SDP to us
                String sdp = new String(value, StandardCharsets.UTF_8);
                Log.i(TAG, "[GATT] SDP written by " + d.getAddress());
                if (responseNeeded) gattServer.sendResponse(d, reqId, BluetoothGatt.GATT_SUCCESS, offset, null);
                JSObject ev = new JSObject();
                ev.put("fromPeerId", d.getAddress());
                ev.put("sdp", sdp);
                notifyListeners("offlineSdpReceived", ev);
            }
        });

        gattServer.addService(service);
        Log.i(TAG, "[GATT] Server started");
        resolve(call, true, null);
    }

    @PluginMethod
    public void stopGattServer(PluginCall call) {
        if (gattServer != null) { gattServer.close(); gattServer = null; }
        resolve(call, true, null);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Wi-Fi Direct — truly offline ad-hoc P2P network
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void startP2pDiscovery(PluginCall call) {
        if (wifiP2pManager == null || p2pChannel == null) { resolve(call, false, "Wi-Fi Direct unavailable"); return; }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) { resolve(call, false, "Location permission required"); return; }

        // Register broadcast receiver
        IntentFilter filter = new IntentFilter();
        filter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
        filter.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);

        p2pReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String action = intent.getAction();
                if (WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION.equals(action)) {
                    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                            != PackageManager.PERMISSION_GRANTED) return;
                    wifiP2pManager.requestPeers(p2pChannel, deviceList -> {
                        JSArray arr = new JSArray();
                        for (WifiP2pDevice dev : deviceList.getDeviceList()) {
                            JSObject p = new JSObject();
                            p.put("name", dev.deviceName);
                            p.put("address", dev.deviceAddress);
                            p.put("status", dev.status);
                            p.put("transport", "wifidirect");
                            arr.put(p);
                        }
                        JSObject ev = new JSObject();
                        ev.put("peers", arr);
                        notifyListeners("wifiDirectPeersChanged", ev);
                    });
                } else if (WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(action)) {
                    android.net.NetworkInfo netInfo = intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO);
                    if (netInfo != null && netInfo.isConnected()) {
                        wifiP2pManager.requestConnectionInfo(p2pChannel, info -> {
                            if (!info.groupFormed) return;
                            String ownerIp = info.groupOwnerAddress != null
                                    ? info.groupOwnerAddress.getHostAddress() : "";
                            Log.i(TAG, "[P2P] Group formed — owner=" + info.isGroupOwner + " ip=" + ownerIp);
                            JSObject ev = new JSObject();
                            ev.put("groupFormed", true);
                            ev.put("isGroupOwner", info.isGroupOwner);
                            ev.put("groupOwnerIp", ownerIp);
                            notifyListeners("wifiDirectConnected", ev);
                        });
                    } else {
                        JSObject ev = new JSObject();
                        ev.put("groupFormed", false);
                        notifyListeners("wifiDirectDisconnected", ev);
                    }
                }
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(p2pReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(p2pReceiver, filter);
        }

        wifiP2pManager.discoverPeers(p2pChannel, new WifiP2pManager.ActionListener() {
            @Override public void onSuccess() { isP2pDiscovering = true; resolve(call, true, null); }
            @Override public void onFailure(int reason) { resolve(call, false, "P2P discovery failed (code=" + reason + ")"); }
        });
    }

    @PluginMethod
    public void stopP2pDiscovery(PluginCall call) {
        if (p2pReceiver != null) {
            try { getContext().unregisterReceiver(p2pReceiver); } catch (Exception ignored) {}
            p2pReceiver = null;
        }
        if (wifiP2pManager != null && p2pChannel != null && isP2pDiscovering) {
            wifiP2pManager.stopPeerDiscovery(p2pChannel, new WifiP2pManager.ActionListener() {
                @Override public void onSuccess() { isP2pDiscovering = false; resolve(call, true, null); }
                @Override public void onFailure(int r) { isP2pDiscovering = false; resolve(call, true, null); }
            });
        } else {
            resolve(call, true, null);
        }
    }

    @PluginMethod
    public void connectWifiDirect(PluginCall call) {
        String deviceAddress = call.getString("deviceAddress");
        if (deviceAddress == null || wifiP2pManager == null || p2pChannel == null) {
            call.reject("deviceAddress required and Wi-Fi Direct must be available"); return;
        }
        WifiP2pConfig config = new WifiP2pConfig();
        config.deviceAddress = deviceAddress;
        wifiP2pManager.connect(p2pChannel, config, new WifiP2pManager.ActionListener() {
            @Override public void onSuccess() { resolve(call, true, null); }
            @Override public void onFailure(int r) { resolve(call, false, "Connect failed (code=" + r + ")"); }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Wi-Fi info / hotspot (unchanged from original)
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void getWifiInfo(PluginCall call) {
        JSObject r = new JSObject();
        try {
            if (wifiManager != null) {
                WifiInfo wi = wifiManager.getConnectionInfo();
                String ssid = wi.getSSID() != null ? wi.getSSID().replace("\"", "") : "";
                int ipInt = wi.getIpAddress();
                String ip = String.format("%d.%d.%d.%d",
                        (ipInt & 0xff), (ipInt >> 8 & 0xff), (ipInt >> 16 & 0xff), (ipInt >> 24 & 0xff));
                r.put("ssid", ssid);
                r.put("ip", ip);
                r.put("isConnected", wifiManager.isWifiEnabled() && wi.getNetworkId() != -1);
            } else {
                r.put("ssid", ""); r.put("ip", ""); r.put("isConnected", false);
            }
        } catch (Exception e) {
            r.put("ssid", ""); r.put("ip", ""); r.put("isConnected", false);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        JSObject r = new JSObject();
        String ip = getLocalIpAddress();
        r.put("ip", ip != null ? ip : "");
        call.resolve(r);
    }

    @PluginMethod
    public void createHotspot(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            resolve(call, false, "Requires Android 8.0+"); return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("location", call, "onLocationPermissionResult"); return;
        }
        startLocalOnlyHotspot(call);
    }

    @PermissionCallback
    private void onLocationPermissionResult(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) startLocalOnlyHotspot(call);
        else resolve(call, false, "Location permission denied");
    }

    private void startLocalOnlyHotspot(PluginCall call) {
        try {
            wifiManager.startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override public void onStarted(WifiManager.LocalOnlyHotspotReservation reservation) {
                    hotspotReservation = reservation;
                    JSObject r = new JSObject();
                    r.put("success", true);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        android.net.wifi.SoftApConfiguration c = reservation.getSoftApConfiguration();
                        r.put("ssid", c.getSsid() != null ? c.getSsid() : "");
                        r.put("password", c.getPassphrase() != null ? c.getPassphrase() : "");
                    } else {
                        android.net.wifi.WifiConfiguration c = reservation.getWifiConfiguration();
                        r.put("ssid", c != null && c.SSID != null ? c.SSID : "");
                        r.put("password", c != null && c.preSharedKey != null ? c.preSharedKey : "");
                    }
                    call.resolve(r);
                    JSObject ev = new JSObject(); ev.put("state", "started"); notifyListeners("hotspotStateChanged", ev);
                }
                @Override public void onStopped() {
                    hotspotReservation = null;
                    JSObject ev = new JSObject(); ev.put("state", "stopped"); notifyListeners("hotspotStateChanged", ev);
                }
                @Override public void onFailed(int reason) { resolve(call, false, "Hotspot failed (code=" + reason + ")"); }
            }, null);
        } catch (Exception e) { resolve(call, false, e.getMessage()); }
    }

    @PluginMethod
    public void stopHotspot(PluginCall call) {
        if (hotspotReservation != null) { hotspotReservation.close(); hotspotReservation = null; resolve(call, true, null); }
        else resolve(call, false, "No active hotspot");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Permissions
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) { resolveGranted(call, true); return; }
        requestPermissionForAlias("location", call, "onRequestLocationResult");
    }
    @PermissionCallback
    private void onRequestLocationResult(PluginCall call) {
        resolveGranted(call, getPermissionState("location") == PermissionState.GRANTED);
    }

    @PluginMethod
    public void requestNearbyPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            boolean granted = ContextCompat.checkSelfPermission(getContext(), "android.permission.NEARBY_WIFI_DEVICES")
                    == PackageManager.PERMISSION_GRANTED;
            if (granted) { resolveGranted(call, true); return; }
            ActivityCompat.requestPermissions(getActivity(), new String[]{"android.permission.NEARBY_WIFI_DEVICES"}, PERM_CODE);
            resolveGranted(call, false);
        } else {
            resolveGranted(call, ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED);
        }
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            String[] perms = { "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_ADVERTISE", "android.permission.BLUETOOTH_CONNECT" };
            boolean all = true;
            for (String p : perms) if (ContextCompat.checkSelfPermission(getContext(), p) != PackageManager.PERMISSION_GRANTED) { all = false; break; }
            if (all) { resolveGranted(call, true); return; }
            ActivityCompat.requestPermissions(getActivity(), perms, PERM_CODE_BT);
            resolveGranted(call, false);
        } else {
            resolveGranted(call, ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED);
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject r = new JSObject();
        r.put("location",   ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)  == PackageManager.PERMISSION_GRANTED);
        r.put("wifi",       ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_WIFI_STATE)      == PackageManager.PERMISSION_GRANTED);
        r.put("nearby",     Build.VERSION.SDK_INT >= 33
                ? ContextCompat.checkSelfPermission(getContext(), "android.permission.NEARBY_WIFI_DEVICES") == PackageManager.PERMISSION_GRANTED
                : ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
        r.put("bluetooth",  Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_SCAN") == PackageManager.PERMISSION_GRANTED
                : ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED);
        call.resolve(r);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Share
    // ═══════════════════════════════════════════════════════════════════════════

    @PluginMethod
    public void shareFile(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) { call.reject("URI required"); return; }
        try {
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType(call.getString("mimeType", "application/octet-stream"));
            share.putExtra(Intent.EXTRA_STREAM, android.net.Uri.parse(uri));
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(share, call.getString("title", "Share")));
            resolve(call, true, null);
        } catch (Exception e) { call.reject("Share failed: " + e.getMessage()); }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Cleanup
    // ═══════════════════════════════════════════════════════════════════════════

    @Override
    protected void handleOnDestroy() {
        // SDP server
        sdpRunning.set(false);
        try { if (sdpServerSocket != null) sdpServerSocket.close(); } catch (Exception ignored) {}

        // NSD
        try { if (nsdDiscListener != null) nsdManager.stopServiceDiscovery(nsdDiscListener); }  catch (Exception ignored) {}
        try { if (nsdRegListener  != null) nsdManager.unregisterService(nsdRegListener); }      catch (Exception ignored) {}

        // BLE
        try { if (bleAdvertiser != null && bleAdvCallback != null) bleAdvertiser.stopAdvertising(bleAdvCallback); } catch (Exception ignored) {}
        try { if (bleScanner    != null && bleScanCallback != null) bleScanner.stopScan(bleScanCallback); }         catch (Exception ignored) {}
        try { if (gattServer    != null) gattServer.close(); }                                                      catch (Exception ignored) {}

        // Hotspot
        try { if (hotspotReservation != null) hotspotReservation.close(); } catch (Exception ignored) {}

        // Wi-Fi Direct
        try { if (p2pReceiver != null) getContext().unregisterReceiver(p2pReceiver); }               catch (Exception ignored) {}
        try { if (wifiP2pManager != null && p2pChannel != null && isP2pDiscovering)
                  wifiP2pManager.stopPeerDiscovery(p2pChannel, null); }                              catch (Exception ignored) {}

        executor.shutdownNow();
        super.handleOnDestroy();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Utilities
    // ═══════════════════════════════════════════════════════════════════════════

    private String getLocalIpAddress() {
        try {
            for (NetworkInterface iface : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (InetAddress addr : Collections.list(iface.getInetAddresses()))
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) return addr.getHostAddress();
        } catch (Exception e) { Log.e(TAG, "getLocalIp: " + e.getMessage()); }
        return null;
    }

    private void resolve(PluginCall call, boolean success, String error) {
        JSObject r = new JSObject();
        r.put("success", success);
        if (error != null) r.put("error", error);
        call.resolve(r);
    }

    private void reject(PluginCall call, String msg) { call.reject(msg); }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject r = new JSObject(); r.put("granted", granted); call.resolve(r);
    }
}
