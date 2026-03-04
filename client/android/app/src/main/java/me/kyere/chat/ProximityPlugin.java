package me.kyere.chat;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pDeviceList;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * ProximityPlugin — Capacitor plugin for Nearby Transfer
 * 
 * Provides:
 * - Wi-Fi information (SSID, IP)
 * - Local-only hotspot creation (Android 8.0+)
 * - Wi-Fi Direct peer discovery
 * - Permission management
 * - System share sheet for .eph files
 */
@CapacitorPlugin(
    name = "Proximity",
    permissions = {
        @Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION }
        ),
        @Permission(
            alias = "wifi",
            strings = {
                Manifest.permission.ACCESS_WIFI_STATE,
                Manifest.permission.CHANGE_WIFI_STATE
            }
        )
    }
)
@SuppressWarnings("deprecation")
public class ProximityPlugin extends Plugin {

    private static final String TAG = "ProximityPlugin";
    private static final int PERMISSION_REQUEST_CODE = 9001;

    private WifiManager wifiManager;
    private WifiP2pManager wifiP2pManager;
    private WifiP2pManager.Channel p2pChannel;
    private WifiManager.LocalOnlyHotspotReservation hotspotReservation;
    private boolean isP2pDiscovering = false;

    @Override
    public void load() {
        super.load();
        wifiManager = (WifiManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_SERVICE);
        wifiP2pManager = (WifiP2pManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_P2P_SERVICE);
        if (wifiP2pManager != null) {
            p2pChannel = wifiP2pManager.initialize(
                    getContext(), getContext().getMainLooper(), null);
        }
        Log.i(TAG, "ProximityPlugin loaded");
    }

    // ─── Wi-Fi Info ───────────────────────────────────────────

    @PluginMethod
    public void getWifiInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            if (wifiManager != null) {
                WifiInfo wifiInfo = wifiManager.getConnectionInfo();
                String ssid = wifiInfo.getSSID();
                if (ssid != null) {
                    ssid = ssid.replace("\"", "");
                }
                int ipInt = wifiInfo.getIpAddress();
                String ip = String.format("%d.%d.%d.%d",
                        (ipInt & 0xff), (ipInt >> 8 & 0xff),
                        (ipInt >> 16 & 0xff), (ipInt >> 24 & 0xff));

                result.put("ssid", ssid != null ? ssid : "");
                result.put("ip", ip);
                result.put("isConnected", wifiManager.isWifiEnabled() && 
                        wifiInfo.getNetworkId() != -1);
            } else {
                result.put("ssid", "");
                result.put("ip", "");
                result.put("isConnected", false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting WiFi info", e);
            result.put("ssid", "");
            result.put("ip", "");
            result.put("isConnected", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        JSObject result = new JSObject();
        try {
            String ip = getLocalIpAddress();
            result.put("ip", ip != null ? ip : "");
        } catch (Exception e) {
            result.put("ip", "");
        }
        call.resolve(result);
    }

    // ─── Hotspot ──────────────────────────────────────────────

    @PluginMethod
    public void createHotspot(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Hotspot creation requires Android 8.0 or higher");
            call.resolve(result);
            return;
        }

        // Check permissions
        if (ContextCompat.checkSelfPermission(getContext(), 
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("location", call, "onLocationPermissionResult");
            return;
        }

        startLocalOnlyHotspot(call);
    }

    @PermissionCallback
    private void onLocationPermissionResult(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            startLocalOnlyHotspot(call);
        } else {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Location permission is required for hotspot creation");
            call.resolve(result);
        }
    }

    private void startLocalOnlyHotspot(PluginCall call) {
        try {
            wifiManager.startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override
                public void onStarted(WifiManager.LocalOnlyHotspotReservation reservation) {
                    hotspotReservation = reservation;
                    JSObject result = new JSObject();
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        // Android 11+: get SoftApConfiguration
                        android.net.wifi.SoftApConfiguration config = reservation.getSoftApConfiguration();
                        result.put("ssid", config.getSsid() != null ? config.getSsid() : "");
                        result.put("password", config.getPassphrase() != null ? config.getPassphrase() : "");
                    } else {
                        // Android 8-10: use WifiConfiguration
                        android.net.wifi.WifiConfiguration config = reservation.getWifiConfiguration();
                        result.put("ssid", config != null && config.SSID != null ? config.SSID : "");
                        result.put("password", config != null && config.preSharedKey != null ? config.preSharedKey : "");
                    }
                    
                    result.put("success", true);
                    call.resolve(result);

                    // Notify JS side
                    JSObject event = new JSObject();
                    event.put("state", "started");
                    event.put("ssid", result.getString("ssid"));
                    notifyListeners("hotspotStateChanged", event);
                }

                @Override
                public void onStopped() {
                    hotspotReservation = null;
                    JSObject event = new JSObject();
                    event.put("state", "stopped");
                    notifyListeners("hotspotStateChanged", event);
                }

                @Override
                public void onFailed(int reason) {
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("error", "Hotspot creation failed (code: " + reason + ")");
                    call.resolve(result);
                }
            }, null);
        } catch (Exception e) {
            Log.e(TAG, "Error creating hotspot", e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void stopHotspot(PluginCall call) {
        JSObject result = new JSObject();
        try {
            if (hotspotReservation != null) {
                hotspotReservation.close();
                hotspotReservation = null;
                result.put("success", true);
            } else {
                result.put("success", false);
                result.put("error", "No active hotspot");
            }
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
        }
        call.resolve(result);
    }

    // ─── Wi-Fi Direct ─────────────────────────────────────────

    @PluginMethod
    public void startWifiDirect(PluginCall call) {
        if (wifiP2pManager == null || p2pChannel == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Wi-Fi Direct not available");
            call.resolve(result);
            return;
        }

        if (ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Location permission required for Wi-Fi Direct");
            call.resolve(result);
            return;
        }

        wifiP2pManager.discoverPeers(p2pChannel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() {
                isP2pDiscovering = true;
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            }

            @Override
            public void onFailure(int reason) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Wi-Fi Direct discovery failed (code: " + reason + ")");
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void stopWifiDirect(PluginCall call) {
        if (wifiP2pManager != null && p2pChannel != null && isP2pDiscovering) {
            wifiP2pManager.stopPeerDiscovery(p2pChannel, new WifiP2pManager.ActionListener() {
                @Override
                public void onSuccess() {
                    isP2pDiscovering = false;
                    JSObject result = new JSObject();
                    result.put("success", true);
                    call.resolve(result);
                }

                @Override
                public void onFailure(int reason) {
                    JSObject result = new JSObject();
                    result.put("success", false);
                    call.resolve(result);
                }
            });
        } else {
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void connectWifiDirect(PluginCall call) {
        String deviceAddress = call.getString("deviceAddress");
        if (deviceAddress == null || deviceAddress.isEmpty()) {
            call.reject("Device address is required");
            return;
        }

        if (wifiP2pManager == null || p2pChannel == null) {
            call.reject("Wi-Fi Direct not available");
            return;
        }

        WifiP2pConfig config = new WifiP2pConfig();
        config.deviceAddress = deviceAddress;

        if (ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Location permission required");
            return;
        }

        wifiP2pManager.connect(p2pChannel, config, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() {
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            }

            @Override
            public void onFailure(int reason) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Wi-Fi Direct connection failed (code: " + reason + ")");
                call.resolve(result);
            }
        });
    }

    // ─── Permissions ──────────────────────────────────────────

    @PluginMethod
    public void requestLocationPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            requestPermissionForAlias("location", call, "onRequestLocationResult");
        }
    }

    @PermissionCallback
    private void onRequestLocationResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", 
                getPermissionState("location") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void requestNearbyPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+: NEARBY_WIFI_DEVICES
            if (ContextCompat.checkSelfPermission(getContext(),
                    "android.permission.NEARBY_WIFI_DEVICES") == PackageManager.PERMISSION_GRANTED) {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
            } else {
                ActivityCompat.requestPermissions(getActivity(),
                        new String[]{"android.permission.NEARBY_WIFI_DEVICES"},
                        PERMISSION_REQUEST_CODE);
                JSObject result = new JSObject();
                result.put("granted", false);
                result.put("requested", true);
                call.resolve(result);
            }
        } else {
            // Pre-Android 13: location permission covers this
            JSObject result = new JSObject();
            result.put("granted", ContextCompat.checkSelfPermission(getContext(),
                    Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
        result.put("wifi", ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.ACCESS_WIFI_STATE) == PackageManager.PERMISSION_GRANTED);
        
        if (Build.VERSION.SDK_INT >= 33) {
            result.put("nearby", ContextCompat.checkSelfPermission(getContext(),
                    "android.permission.NEARBY_WIFI_DEVICES") == PackageManager.PERMISSION_GRANTED);
        } else {
            result.put("nearby", result.optBoolean("location", false));
        }
        
        call.resolve(result);
    }

    // ─── Share ────────────────────────────────────────────────

    @PluginMethod
    public void shareFile(PluginCall call) {
        String uri = call.getString("uri");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String title = call.getString("title", "Share file");

        if (uri == null || uri.isEmpty()) {
            call.reject("URI is required");
            return;
        }

        try {
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, android.net.Uri.parse(uri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(shareIntent, title));
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to share: " + e.getMessage());
        }
    }

    // ─── Utility ──────────────────────────────────────────────

    private String getLocalIpAddress() {
        try {
            List<NetworkInterface> interfaces = Collections.list(
                    NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface iface : interfaces) {
                List<InetAddress> addresses = Collections.list(iface.getInetAddresses());
                for (InetAddress addr : addresses) {
                    if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting local IP", e);
        }
        return null;
    }

    @Override
    protected void handleOnDestroy() {
        // Clean up hotspot
        if (hotspotReservation != null) {
            try {
                hotspotReservation.close();
            } catch (Exception ignored) {}
            hotspotReservation = null;
        }
        // Stop Wi-Fi Direct discovery
        if (wifiP2pManager != null && p2pChannel != null && isP2pDiscovering) {
            try {
                wifiP2pManager.stopPeerDiscovery(p2pChannel, null);
            } catch (Exception ignored) {}
        }
        super.handleOnDestroy();
    }
}
