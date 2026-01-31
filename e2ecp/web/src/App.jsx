import React, { useCallback, useEffect, useRef, useState } from "react";
import protobuf from "protobufjs";
import { QRCodeSVG } from "qrcode.react";
import JSZip from "jszip";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useConfig } from "./ConfigContext";
import Navbar from "./Navbar";

/* ---------- Crypto helpers (ECDH + AES-GCM) ---------- */

// Generate ephemeral ECDH key pair
async function generateECDHKeyPair() {
    return await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"],
    );
}

// Export our public key for sharing
async function exportPubKey(pubKey) {
    const raw = await window.crypto.subtle.exportKey("raw", pubKey);
    return new Uint8Array(raw);
}

// Import peer's public key
async function importPeerPubKey(rawBytes) {
    return await window.crypto.subtle.importKey(
        "raw",
        rawBytes,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );
}

// Derive AES key from shared secret
async function deriveSharedKey(privKey, peerPubKey) {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: peerPubKey },
        privKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

// AES-GCM encrypt/decrypt
async function encryptBytes(aesKey, plainBuffer) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        plainBuffer,
    );
    return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decryptBytes(aesKey, ivBytes, cipherBytes) {
    const plain = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        aesKey,
        cipherBytes,
    );
    return new Uint8Array(plain);
}

// Helpers: base64 encode/decode
function uint8ToBase64(u8) {
    let binary = "";
    for (let i = 0; i < u8.length; i++) {
        binary += String.fromCharCode(u8[i]);
    }
    return btoa(binary);
}
function base64ToUint8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// Calculate SHA256 hash of data
async function calculateSHA256(data) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex;
}

/* ------------------- Protobuf Message Handling ------------------- */

// Protobuf schema definition
// NOTE: This schema is duplicated from src/relay/messages.proto for the web client.
// Keep in sync with the proto file or consider using a build step to import it.
const protoSchema = `
syntax = "proto3";

package relay;

message PBIncomingMessage {
  string type = 1;
  string room_id = 2;
  string client_id = 3;
  string pub = 4;
  string iv_b64 = 7;
  string data_b64 = 8;
  string chunk_data = 9;
  int32 chunk_num = 10;
  string encrypted_metadata = 20;
  string metadata_iv = 21;
  repeated string recipients = 23;
}

message PBOutgoingMessage {
  string type = 1;
  string from = 2;
  string mnemonic = 3;
  string room_id = 4;
  string pub = 5;
  string iv_b64 = 8;
  string data_b64 = 9;
  string chunk_data = 10;
  int32 chunk_num = 11;
  string self_id = 13;
  repeated string peers = 14;
  int32 count = 15;
  string error = 16;
  string encrypted_metadata = 20;
  string metadata_iv = 21;
  string peer_id = 22;
  repeated string recipients = 23;
}
`;

let pbIncomingMessage, pbOutgoingMessage;

// Load protobuf schema once
const root = protobuf.parse(protoSchema).root;
pbIncomingMessage = root.lookupType("relay.PBIncomingMessage");
pbOutgoingMessage = root.lookupType("relay.PBOutgoingMessage");

// Encode message to protobuf
function encodeProtobuf(obj) {
    // Create message using protobufjs - use camelCase field names
    const pbMessage = {
        type: obj.type || "",
    };

    // protobufjs expects camelCase field names that map to snake_case in proto
    if (obj.roomId !== undefined && obj.roomId !== null && obj.roomId !== "") {
        pbMessage.roomId = obj.roomId;
    }
    if (
        obj.clientId !== undefined &&
        obj.clientId !== null &&
        obj.clientId !== ""
    ) {
        pbMessage.clientId = obj.clientId;
    }
    if (obj.pub !== undefined && obj.pub !== null && obj.pub !== "") {
        pbMessage.pub = obj.pub;
    }
    if (obj.iv_b64 !== undefined && obj.iv_b64 !== null && obj.iv_b64 !== "") {
        pbMessage.ivB64 = obj.iv_b64;
    }
    if (
        obj.data_b64 !== undefined &&
        obj.data_b64 !== null &&
        obj.data_b64 !== ""
    ) {
        pbMessage.dataB64 = obj.data_b64;
    }
    if (
        obj.chunk_data !== undefined &&
        obj.chunk_data !== null &&
        obj.chunk_data !== ""
    ) {
        pbMessage.chunkData = obj.chunk_data;
    }
    if (obj.chunk_num !== undefined && obj.chunk_num !== null) {
        pbMessage.chunkNum = obj.chunk_num;
    }
    if (
        obj.encrypted_metadata !== undefined &&
        obj.encrypted_metadata !== null &&
        obj.encrypted_metadata !== ""
    ) {
        pbMessage.encryptedMetadata = obj.encrypted_metadata;
    }
    if (
        obj.metadata_iv !== undefined &&
        obj.metadata_iv !== null &&
        obj.metadata_iv !== ""
    ) {
        pbMessage.metadataIv = obj.metadata_iv;
    }
    if (obj.recipients && Array.isArray(obj.recipients)) {
        pbMessage.recipients = obj.recipients;
    }

    const message = pbIncomingMessage.create(pbMessage);
    return pbIncomingMessage.encode(message).finish();
}

// Decode protobuf message
function decodeProtobuf(buffer) {
    const message = pbOutgoingMessage.decode(buffer);
    // protobufjs provides camelCase properties for snake_case proto fields
    return {
        type: message.type,
        from: message.from,
        mnemonic: message.mnemonic,
        roomId: message.roomId,
        pub: message.pub,
        iv_b64: message.ivB64,
        data_b64: message.dataB64,
        chunk_data: message.chunkData,
        chunk_num: message.chunkNum,
        selfId: message.selfId,
        peers: message.peers || [],
        count: message.count,
        error: message.error,
        encrypted_metadata: message.encryptedMetadata || null,
        metadata_iv: message.metadataIv || null,
        peerId: message.peerId || null,
        recipients: message.recipients || [],
    };
}

/* ------------------- Helper Functions ------------------- */

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + " " + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + "/s";
}

function formatTime(seconds) {
    if (seconds < 1) return "< 1s";
    if (seconds < 60) return Math.round(seconds) + "s";
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/* ------------------- React Component ------------------- */

const ICON_CLASSES = [
    "fa-anchor",
    "fa-apple-whole",
    "fa-atom",
    "fa-award",
    "fa-basketball",
    "fa-bell",
    "fa-bicycle",
    "fa-bolt",
    "fa-bomb",
    "fa-book",
    "fa-box",
    "fa-brain",
    "fa-briefcase",
    "fa-bug",
    "fa-cake-candles",
    "fa-calculator",
    "fa-camera",
    "fa-campground",
    "fa-car",
    "fa-carrot",
    "fa-cat",
    "fa-chess-knight",
    "fa-chess-rook",
    "fa-cloud",
    "fa-code",
    "fa-gear",
    "fa-compass",
    "fa-cookie",
    "fa-crow",
    "fa-cube",
    "fa-diamond",
    "fa-dog",
    "fa-dove",
    "fa-dragon",
    "fa-droplet",
    "fa-drum",
    "fa-earth-americas",
    "fa-egg",
    "fa-envelope",
    "fa-fan",
    "fa-feather",
    "fa-fire",
    "fa-fish",
    "fa-flag",
    "fa-flask",
    "fa-floppy-disk",
    "fa-folder",
    "fa-football",
    "fa-frog",
    "fa-gamepad",
    "fa-gavel",
    "fa-gem",
    "fa-ghost",
    "fa-gift",
    "fa-guitar",
    "fa-hammer",
    "fa-hat-cowboy",
    "fa-hat-wizard",
    "fa-heart",
    "fa-helicopter",
    "fa-helmet-safety",
    "fa-hippo",
    "fa-horse",
    "fa-hourglass-half",
    "fa-snowflake",
    "fa-key",
    "fa-leaf",
    "fa-lightbulb",
    "fa-magnet",
    "fa-map",
    "fa-microphone",
    "fa-moon",
    "fa-mountain",
    "fa-mug-hot",
    "fa-music",
    "fa-paintbrush",
    "fa-paper-plane",
    "fa-paw",
    "fa-pen",
    "fa-pepper-hot",
    "fa-rocket",
    "fa-road",
    "fa-school",
    "fa-screwdriver-wrench",
    "fa-scroll",
    "fa-seedling",
    "fa-shield-heart",
    "fa-ship",
    "fa-skull",
    "fa-sliders",
    "fa-splotch",
    "fa-spider",
    "fa-star",
    "fa-sun",
    "fa-toolbox",
    "fa-tornado",
    "fa-tree",
    "fa-trophy",
    "fa-truck",
    "fa-user-astronaut",
    "fa-wand-magic-sparkles",
    "fa-wrench",
    "fa-pizza-slice",
    "fa-burger",
    "fa-lemon",
];

function mnemonicToIcons(mnemonic) {
    if (!mnemonic) {
        return [
            "fa-circle-question",
            "fa-circle-question",
            "fa-circle-question",
        ];
    }

    // Split mnemonic into words (format: "word1-word2-word3")
    const words = mnemonic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    const icons = [];

    // Map each word to its corresponding icon
    for (const word of words) {
        const directMatch = ICON_CLASSES.find((icon) => icon.includes(word));
        if (directMatch) {
            icons.push(directMatch);
        } else {
            // Fallback: use hash-based selection for this word
            let hash = 0;
            for (let i = 0; i < word.length; i++) {
                hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
            }
            icons.push(ICON_CLASSES[hash % ICON_CLASSES.length]);
        }
    }

    // Ensure we always have 3 icons
    while (icons.length < 3) {
        icons.push("fa-circle-question");
    }

    return icons.slice(0, 3);
}

function IconBadge({ mnemonic, label, className = "" }) {
    if (!mnemonic) {
        return null;
    }
    const iconClasses = mnemonicToIcons(mnemonic);
    return (
        <div className={`relative group ${className}`}>
            <div
                tabIndex={0}
                className="bg-gray-100/80 dark:bg-white/10 backdrop-blur-sm text-gray-900 dark:text-gray-100 px-4 py-2.5 inline-flex items-center justify-center gap-2.5 rounded-2xl border border-gray-200/50 dark:border-white/10 font-bold focus:outline-hidden transition-all duration-200 hover:bg-white dark:hover:bg-white/20 hover:shadow-lg hover:shadow-black/5"
                aria-label={`${label}: ${mnemonic}`}
            >
                {iconClasses.map((iconClass, index) => (
                    <i
                        key={index}
                        className={`fas ${iconClass} text-lg sm:text-xl opacity-80 group-hover:opacity-100 transition-opacity`}
                        aria-hidden="true"
                    ></i>
                ))}
                {label === "You" && (
                    <span className="text-xs font-black uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-lg ml-1">YOU</span>
                )}
            </div>
            <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-200 bg-gray-900/90 dark:bg-white/90 text-white dark:text-gray-900 backdrop-blur-sm px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-xl transform scale-95 group-hover:scale-100 group-hover:-translate-y-[calc(100%+8px)]">
                {mnemonic.toUpperCase()}
            </div>
        </div>
    );
}

function ProgressBar({ progress, label }) {
    if (!progress) return null;

    // Remove emoji from label
    const cleanLabel = label.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim();

    return (
        <div className="bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 p-4 sm:p-5 rounded-2xl mb-4 backdrop-blur-sm transition-all duration-300">
            <div className="flex justify-between items-end mb-3">
                <div className="text-sm font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {cleanLabel}
                </div>
                <div className="text-xl font-black text-primary-600 dark:text-primary-400">
                    {progress.percent}%
                </div>
            </div>
            <div className="relative w-full h-3 sm:h-4 bg-gray-200/50 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                    className="absolute top-0 left-0 h-full bg-linear-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                    style={{ width: `${progress.percent}%` }}
                />
            </div>
            {(progress.speed > 0 || progress.eta > 0) && (
                <div className="mt-3 text-xs font-bold flex flex-wrap gap-x-6 gap-y-1 text-gray-500 dark:text-gray-400">
                    {progress.speed > 0 && (
                        <span className="flex items-center gap-1.5">
                            <i className="fas fa-bolt text-primary-500/70"></i>
                            {formatSpeed(progress.speed)}
                        </span>
                    )}
                    {progress.eta > 0 && progress.percent < 100 && (
                        <span className="flex items-center gap-1.5">
                            <i className="fas fa-clock text-primary-500/70"></i>
                            {formatTime(progress.eta)}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}


async function generateMnemonic() {
    const iconClasses = ICON_CLASSES;
    const words = [];
    for (let i = 0; i < 3; i++) {
        const randomIcon = iconClasses[Math.floor(Math.random() * iconClasses.length)];
        // remove 'fa-' prefix
        words.push(randomIcon.replace("fa-", ""));
    }
    return words.join("-");
}


export default function App() {
    const { isAuthenticated, user, loading: authLoading } = useAuth();
    const { config, loading: configLoading } = useConfig();
    const navigate = useNavigate();

    // Parse room from URL path (e.g., /myroom -> "myroom")
    const rawPath = window.location.pathname.slice(1).toLowerCase();
    const reservedPaths = ["login", "profile", "settings", "verify-email", "files"]; // Added "files" just in case
    const pathRoom = reservedPaths.includes(rawPath) ? "" : rawPath;

    // Parse query params for room and recipients
    const queryParams = new URLSearchParams(window.location.search);
    const initialRoomId = queryParams.get("room") || window.location.pathname.substring(1);
    const initialRecipients = queryParams.get("recipients") // comma separated IDs
        ? queryParams.get("recipients").split(",")
        : [];
    const initialUsername = queryParams.get("username"); // Added username param
    const initialUserId = queryParams.get("userId"); // Added userId param

    const [roomId, setRoomId] = useState(initialRoomId || "");
    const [connected, setConnected] = useState(false);
    const [status, setStatus] = useState("Not connected");
    const [peerCount, setPeerCount] = useState(1);

    // Multi-Peer State: Map<peerId, { mnemonic, pubKey, sessionStart }>
    const [peers, setPeers] = useState(new Map());
    const peersRef = useRef(new Map()); // Mutable ref for callbacks

    const [myMnemonic, setMyMnemonic] = useState("");

    // Multi-AES Keys: Map<peerId, CryptoKey>
    const peerKeysRef = useRef(new Map());
    const activeIncomingKeyRef = useRef(null); // Key for currently receiving file
    const activeIncomingSenderIdRef = useRef(null); // Sender for currently receiving file
    // Legacy Refs (for backward compat during refactor)
    const socketRef = useRef(null);
    const myMsgKeyRef = useRef(null);
    const myMsgIvRef = useRef(null);

    // Track our own identity - Use URL param if available
    const myIdRef = useRef(initialUserId || null);
    const clientIdRef = useRef(initialUserId || null); // Sync clientIdRef too

    // Initialize Mnemonic
    useEffect(() => {
        if (initialUsername) {
            setMyMnemonic(initialUsername);
        } else {
            // Fallback to random if no username provided
            generateMnemonic().then(setMyMnemonic);
        }
    }, [initialUsername]);

    const [downloadUrl, setDownloadUrl] = useState(null);
    const [downloadName, setDownloadName] = useState(null);
    const [peerMnemonic, setPeerMnemonic] = useState(null);
    const [hasAesKey, setHasAesKey] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(null);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showAboutModal, setShowAboutModal] = useState(false);
    const [showDownloadConfirmModal, setShowDownloadConfirmModal] =
        useState(false);
    const [pendingDownload, setPendingDownload] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [roomIdError, setRoomIdError] = useState(null);
    const [textInput, setTextInput] = useState("");
    const [receivedText, setReceivedText] = useState(null);
    const [showTextModal, setShowTextModal] = useState(false);

    // Auto-join effect
    useEffect(() => {
        if (initialRoomId && !connected) {
            connectToRoom();
        }
    }, [initialRoomId]); // Run once on mount if room is present

    const myKeyPairRef = useRef(null);
    const aesKeyRef = useRef(null);
    const havePeerPubRef = useRef(false);

    const wsRef = useRef(null);
    const selfIdRef = useRef(null);
    const myMnemonicRef = useRef(null);
    // clientIdRef initialized above
    const roomInputRef = useRef(null);
    const fileInputRef = useRef(null);

    // For chunked file reception
    const fileChunksRef = useRef([]);
    const fileNameRef = useRef(null);
    const fileIVRef = useRef(null);
    const fileTotalSizeRef = useRef(0);
    const receivedBytesRef = useRef(0);
    const downloadStartTimeRef = useRef(null);
    const isFolderRef = useRef(false);
    const originalFolderNameRef = useRef(null);
    const expectedHashRef = useRef(null);

    // For chunk ordering and ACK tracking
    const receivedChunksRef = useRef(new Set());
    const chunkBufferRef = useRef(new Map());
    const nextExpectedChunkRef = useRef(0);
    const lastActivityTimeRef = useRef(Date.now());

    // For sending with ACK/retransmission
    const pendingChunksRef = useRef(new Map());
    const ackReceivedRef = useRef(new Set());
    const retransmitTimerRef = useRef(null);

    const myIconClasses = mnemonicToIcons(myMnemonic);
    const peerIconClasses = mnemonicToIcons(peerMnemonic);

    function log(msg) {
        console.log(msg);
    }

    function sendMsg(obj) {
        if (!wsRef.current || wsRef.current.readyState !== 1) return;
        // Send as protobuf binary
        const buffer = encodeProtobuf(obj);
        wsRef.current.send(buffer);
    }

    async function initKeys() {
        myKeyPairRef.current = await generateECDHKeyPair();
        havePeerPubRef.current = false;
        aesKeyRef.current = null;
        setHasAesKey(false);
        log("Generated ECDH key pair");
    }

    async function announcePublicKey() {
        const raw = await exportPubKey(myKeyPairRef.current.publicKey);
        sendMsg({ type: "pubkey", pub: uint8ToBase64(raw) });
        log("Sent my public key");
    }

    async function handlePeerPubKey(b64, peerId, peerName) {
        if (peerKeysRef.current.has(peerId)) return; // Already have key

        const rawPeer = base64ToUint8(b64);
        const peerPub = await importPeerPubKey(rawPeer);
        const sharedAes = await deriveSharedKey(
            myKeyPairRef.current.privateKey,
            peerPub,
        );

        // Store key for this specific peer
        peerKeysRef.current.set(peerId, sharedAes);

        // Update peers state for UI
        setPeers(prev => new Map(prev).set(peerId, {
            id: peerId,
            mnemonic: peerName,
            connected: true
        }));

        // For backward compatibility (if needed for single peer logic, though we should move away from it)
        if (!aesKeyRef.current) {
            aesKeyRef.current = sharedAes; // Set primary key as first derived key
            setPeerMnemonic(peerName);
            setHasAesKey(true);
        }

        log(`Derived shared AES key for ${peerName}`);
    }

    function generateRandomRoomId() {
        const adjectives = [
            "swift",
            "bold",
            "calm",
            "bright",
            "dark",
            "warm",
            "cool",
            "wise",
            "neat",
            "wild",
        ];
        const nouns = [
            "tiger",
            "eagle",
            "ocean",
            "mountain",
            "forest",
            "river",
            "storm",
            "star",
            "moon",
            "sun",
        ];
        const randomAdjective =
            adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        const randomNumber = Math.floor(Math.random() * 100);
        return `${randomAdjective}-${randomNoun}-${randomNumber}`;
    }

    const connectToRoom = useCallback(async () => {
        let room = roomId.trim().toLowerCase();

        // Generate random room ID if empty
        if (!room) {
            room = generateRandomRoomId();
            setRoomId(room);
        }

        // Validate room ID length (minimum 4 characters)
        if (room.length < 4) {
            setRoomIdError(
                "Room ID must be at least 4 characters. Please enter a longer room name.",
            );
            return;
        }

        // Clear any previous errors
        setRoomIdError(null);
        setRoomId(room);
        await initKeys();

        // Dynamically choose ws:// or wss:// based on current page
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host; // includes port if present

        // Fix: Ensure we connect through the proxy path '/e2ecp' if we are served from there
        // This directs the request to localhost:3001/e2ecp/ws -> proxy -> localhost:8080/ws
        const basePath = window.location.pathname.startsWith('/e2ecp') ? '/e2ecp' : '';
        const wsUrl = `${protocol}//${host}${basePath}/ws?username=${encodeURIComponent(myMnemonicRef.current || initialUsername || '')}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setStatus("Connected. Waiting for peer...");
            log("WebSocket open");
            sendMsg({
                type: "join",
                roomId: room,
                clientId: clientIdRef.current,
            });
        };

        ws.onmessage = async (event) => {
            let msg;
            try {
                // Handle both protobuf binary and JSON messages
                if (event.data instanceof Blob) {
                    // Binary protobuf message
                    const arrayBuffer = await event.data.arrayBuffer();
                    const buffer = new Uint8Array(arrayBuffer);
                    msg = decodeProtobuf(buffer);
                } else if (typeof event.data === "string") {
                    // JSON message (fallback for compatibility)
                    msg = JSON.parse(event.data);
                } else {
                    return;
                }
            } catch (e) {
                console.error("Failed to parse message:", e);
                return;
            }

            if (msg.type === "error") {
                setShowErrorModal(true);
                setConnected(false);
                ws.close();
                return;
            }

            if (msg.type === "joined") {
                selfIdRef.current = msg.selfId;
                const mnemonic = msg.mnemonic || msg.selfId;
                myMnemonicRef.current = mnemonic;
                setMyMnemonic(mnemonic);
                log(`Joined room ${msg.roomId} as ${mnemonic}`);
                await announcePublicKey();
                return;
            }

            if (msg.type === "peers") {
                setPeerCount(msg.count);
                setStatus(
                    msg.count === 2
                        ? "Peer connected. Secure channel ready."
                        : `Connected as ${myMnemonicRef.current || "waiting..."}`,
                );
                return;
            }

            if (msg.type === "chunk_ack") {
                // Sender: mark chunk as acknowledged
                const chunkNum = msg.chunk_num;
                ackReceivedRef.current.add(chunkNum);
                pendingChunksRef.current.delete(chunkNum);
                lastActivityTimeRef.current = Date.now();
                return;
            }

            if (msg.type === "pubkey") {
                const peerId = msg.clientId || msg.from; // Use stable ID if available
                const peerName = msg.mnemonic || msg.from;

                // Prevent duplicate processing
                if (peerKeysRef.current.has(peerId)) {
                    return;
                }

                log(`Received peer public key from ${peerName}`);

                // Show connection notification
                const peerIcons = mnemonicToIcons(peerName);
                toast.success(
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {peerIcons.map((iconClass, index) => (
                            <i key={index} className={`fas ${iconClass}`} style={{ fontSize: "16px" }}></i>
                        ))}
                        <span>{peerName.toUpperCase()} CONNECTED</span>
                    </div>,
                    { duration: 3000 },
                );

                await handlePeerPubKey(msg.pub, peerId, peerName);

                // We always announce back so they can derive our key too
                // (Optimization: could check if we already announced to them)
                await announcePublicKey();
                return;
            }

            if (msg.type === "peer_disconnected") {
                const disconnectedPeerId = msg.peerId || msg.from;
                const disconnectedPeerName =
                    msg.mnemonic || msg.from || "Peer";
                log(`${disconnectedPeerName} disconnected`);

                // Show disconnection notification with peer's icons
                const peerIcons = mnemonicToIcons(disconnectedPeerName);
                toast.error(
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        {peerIcons.map((iconClass, index) => (
                            <i
                                key={index}
                                className={`fas ${iconClass}`}
                                aria-hidden="true"
                                style={{ fontSize: "16px" }}
                            ></i>
                        ))}
                        <span>
                            {disconnectedPeerName.toUpperCase()} DISCONNECTED
                        </span>
                    </div>,
                    { duration: 4000 },
                );

                // Update multi-peer state
                setPeers(prev => {
                    const next = new Map(prev);
                    next.delete(disconnectedPeerId);
                    return next;
                });
                peerKeysRef.current.delete(disconnectedPeerId);

                // Handle legacy state if this was the primary peer
                if (peerMnemonic === disconnectedPeerName) {
                    setPeerMnemonic(null);
                    havePeerPubRef.current = false;
                    aesKeyRef.current = null;
                    setHasAesKey(false);
                }

                return;
            }

            if (msg.type === "transfer_received") {
                // Receiver confirmed they successfully received the file or text
                const receiverName = msg.mnemonic || msg.from || "Receiver";

                // Default to "file" if no metadata is provided (for backward compatibility)
                let transferType = "file";

                // Try to decrypt metadata to determine transfer type
                const senderId = msg.from;
                const peerKey = peerKeysRef.current.get(senderId) || aesKeyRef.current;

                if (msg.encrypted_metadata && msg.metadata_iv && peerKey) {
                    try {
                        const metadataIV = base64ToUint8(msg.metadata_iv);
                        const encryptedMetadata = base64ToUint8(msg.encrypted_metadata);
                        const metadataBytes = await decryptBytes(
                            peerKey,
                            metadataIV,
                            encryptedMetadata,
                        );
                        const metadataJSON = new TextDecoder().decode(metadataBytes);
                        const metadata = JSON.parse(metadataJSON);

                        if (metadata.transfer_type) {
                            transferType = metadata.transfer_type;
                        }
                    } catch (err) {
                        console.error("Failed to decrypt transfer_received metadata:", err);
                        // Fall back to default "file"
                    }
                }

                const typeLabel = transferType === "text" ? "TEXT" : "FILE";
                log(`${receiverName} confirmed receipt of the ${typeLabel.toLowerCase()}`);

                // Show success notification with receiver's icons
                const receiverIcons = mnemonicToIcons(receiverName);
                toast.success(
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        {receiverIcons.map((iconClass, index) => (
                            <i
                                key={index}
                                className={`fas ${iconClass}`}
                                aria-hidden="true"
                                style={{ fontSize: "16px" }}
                            ></i>
                        ))}
                        <span>{receiverName.toUpperCase()} RECEIVED {typeLabel}</span>
                    </div>,
                    { duration: 4000 },
                );

                return;
            }

            if (msg.type === "file_start") {
                const senderId = msg.from;
                const peerKey = peerKeysRef.current.get(senderId) || aesKeyRef.current;

                if (!peerKey) {
                    log("Can't decrypt yet (no shared key)");
                    return;
                }

                // Store the key being used for this file session
                activeIncomingKeyRef.current = peerKey;
                activeIncomingSenderIdRef.current = senderId;

                // Decrypt metadata
                if (!msg.encrypted_metadata || !msg.metadata_iv) {
                    console.error("Missing encrypted metadata");
                    log("Missing encrypted metadata");
                    return;
                }

                let fileName,
                    totalSize,
                    isFolder,
                    originalFolderName,
                    isMultipleFiles,
                    expectedHash;

                try {
                    // Decrypt metadata
                    const metadataIV = base64ToUint8(msg.metadata_iv);
                    const encryptedMetadata = base64ToUint8(
                        msg.encrypted_metadata,
                    );
                    const metadataBytes = await decryptBytes(
                        peerKey,
                        metadataIV,
                        encryptedMetadata,
                    );
                    const metadataJSON = new TextDecoder().decode(
                        metadataBytes,
                    );
                    const metadata = JSON.parse(metadataJSON);

                    // Use decrypted metadata
                    fileName = metadata.name;
                    totalSize = metadata.total_size;
                    isFolder = metadata.is_folder || false;
                    originalFolderName = metadata.original_folder_name || null;
                    isMultipleFiles = metadata.is_multiple_files || false;
                    expectedHash = metadata.hash || null;
                } catch (err) {
                    console.error("Failed to decrypt metadata:", err);
                    log("Failed to decrypt metadata");
                    return;
                }

                fileNameRef.current = fileName;
                fileTotalSizeRef.current = totalSize;
                fileChunksRef.current = [];
                receivedBytesRef.current = 0;
                downloadStartTimeRef.current = Date.now();
                isFolderRef.current = isFolder;
                originalFolderNameRef.current = originalFolderName;
                expectedHashRef.current = expectedHash;

                // Reset chunk tracking
                receivedChunksRef.current = new Set();
                chunkBufferRef.current = new Map();
                nextExpectedChunkRef.current = 0;
                lastActivityTimeRef.current = Date.now();

                const displayName = isFolderRef.current
                    ? originalFolderNameRef.current
                    : fileName;
                const typeLabel = isFolderRef.current ? "folder" : "file";
                log(
                    `Incoming encrypted ${typeLabel}: ${displayName} (${formatBytes(totalSize)})`,
                );
                setDownloadProgress({
                    percent: 0,
                    speed: 0,
                    eta: 0,
                    startTime: downloadStartTimeRef.current,
                    fileName: displayName,
                });
                return;
            }

            if (msg.type === "file_chunk") {
                try {
                    const chunkNum = msg.chunk_num;

                    // Check for duplicate chunk
                    if (receivedChunksRef.current.has(chunkNum)) {
                        // Send ACK again for idempotency
                        sendMsg({ type: "chunk_ack", chunk_num: chunkNum });
                        return;
                    }

                    // Decrypt chunk immediately with its own IV
                    const chunkIV = base64ToUint8(msg.iv_b64);
                    const cipherChunk = base64ToUint8(msg.chunk_data);

                    const plainChunk = await decryptBytes(
                        activeIncomingKeyRef.current || aesKeyRef.current,
                        chunkIV,
                        cipherChunk,
                    );

                    // Mark as received
                    receivedChunksRef.current.add(chunkNum);
                    lastActivityTimeRef.current = Date.now();

                    // Handle chunk ordering
                    if (chunkNum === nextExpectedChunkRef.current) {
                        // This is the next expected chunk - add it
                        fileChunksRef.current.push(plainChunk);
                        receivedBytesRef.current += plainChunk.length;
                        nextExpectedChunkRef.current++;

                        // Check if we have buffered chunks that can now be added
                        while (
                            chunkBufferRef.current.has(
                                nextExpectedChunkRef.current,
                            )
                        ) {
                            const bufferedChunk = chunkBufferRef.current.get(
                                nextExpectedChunkRef.current,
                            );
                            fileChunksRef.current.push(bufferedChunk);
                            receivedBytesRef.current += bufferedChunk.length;
                            chunkBufferRef.current.delete(
                                nextExpectedChunkRef.current,
                            );
                            nextExpectedChunkRef.current++;
                        }
                    } else if (chunkNum > nextExpectedChunkRef.current) {
                        // Out-of-order chunk - buffer it
                        chunkBufferRef.current.set(chunkNum, plainChunk);
                    }
                    // If chunkNum < nextExpectedChunkRef.current, it's a duplicate

                    const elapsed =
                        (Date.now() - downloadStartTimeRef.current) / 1000;
                    const speed =
                        elapsed > 0 ? receivedBytesRef.current / elapsed : 0;
                    const percent =
                        fileTotalSizeRef.current > 0
                            ? Math.round(
                                (receivedBytesRef.current /
                                    fileTotalSizeRef.current) *
                                100,
                            )
                            : 0;

                    const remainingBytes =
                        fileTotalSizeRef.current - receivedBytesRef.current;
                    const eta = speed > 0 ? remainingBytes / speed : 0;

                    setDownloadProgress({
                        percent,
                        speed,
                        eta,
                        startTime: downloadStartTimeRef.current,
                        fileName: fileNameRef.current,
                    });

                    // Send ACK for this chunk
                    sendMsg({ type: "chunk_ack", chunk_num: chunkNum });
                } catch (err) {
                    console.error("Chunk decryption failed:", err);
                    log("Chunk decryption failed");
                }
                return;
            }

            if (msg.type === "file_end") {
                if (!aesKeyRef.current || fileChunksRef.current.length === 0) {
                    log("No file data received");
                    setDownloadProgress(null);
                    return;
                }

                try {
                    // Reassemble plaintext from decrypted chunks
                    const totalLen = fileChunksRef.current.reduce(
                        (sum, chunk) => sum + chunk.length,
                        0,
                    );
                    const plainBytes = new Uint8Array(totalLen);
                    let offset = 0;
                    for (const chunk of fileChunksRef.current) {
                        plainBytes.set(chunk, offset);
                        offset += chunk.length;
                    }

                    // Verify file hash if provided
                    if (expectedHashRef.current) {
                        const actualHash = await calculateSHA256(plainBytes);
                        if (actualHash !== expectedHashRef.current) {
                            log(`⚠️  WARNING: File hash mismatch!`);
                            log(`   Expected: ${expectedHashRef.current}`);
                            log(`   Received: ${actualHash}`);
                            log(
                                `   The file may be corrupted or tampered with.`,
                            );
                        } else {
                            const hashPrefix =
                                expectedHashRef.current.substring(0, 8);
                            const hashSuffix =
                                expectedHashRef.current.substring(
                                    expectedHashRef.current.length - 8,
                                );
                            log(
                                `✓ File integrity verified (hash: ${hashPrefix}...${hashSuffix})`,
                            );
                        }
                    }

                    const elapsed =
                        (Date.now() - downloadStartTimeRef.current) / 1000;
                    const speed = elapsed > 0 ? totalLen / elapsed : 0;

                    // Determine download name based on whether it's a folder
                    let downloadFileName;
                    if (isFolderRef.current && originalFolderNameRef.current) {
                        downloadFileName =
                            originalFolderNameRef.current + ".zip";
                    } else {
                        downloadFileName =
                            fileNameRef.current || "download.bin";
                    }

                    setDownloadProgress({
                        percent: 100,
                        speed,
                        eta: 0,
                        fileName: downloadFileName,
                    });

                    const blob = new Blob([plainBytes], {
                        type: isFolderRef.current
                            ? "application/zip"
                            : "application/octet-stream",
                    });
                    const url = URL.createObjectURL(blob);

                    const typeLabel = isFolderRef.current ? "folder" : "file";

                    // Store pending download and show confirmation modal
                    setPendingDownload({
                        url: url,
                        name: downloadFileName,
                        size: formatBytes(totalLen),
                        type: typeLabel,
                    });
                    setShowDownloadConfirmModal(true);

                    log(
                        `Decrypted and prepared download "${downloadFileName}" (${typeLabel})`,
                    );

                    // Send transfer received confirmation to sender with encrypted metadata
                    try {
                        const transferMetadata = {
                            transfer_type: "file",
                        };
                        const metadataJSON = JSON.stringify(transferMetadata);
                        const metadataBytes = new TextEncoder().encode(metadataJSON);
                        const { iv: metadataIV, ciphertext: encryptedMetadataBytes } =
                            await encryptBytes(activeIncomingKeyRef.current || aesKeyRef.current, metadataBytes);

                        sendMsg({
                            type: "transfer_received",
                            encrypted_metadata: uint8ToBase64(encryptedMetadataBytes),
                            metadata_iv: uint8ToBase64(metadataIV),
                            recipients: activeIncomingSenderIdRef.current ? [activeIncomingSenderIdRef.current] : []
                        });
                    } catch (err) {
                        console.error("Failed to encrypt transfer_received metadata:", err);
                        // Fall back to sending without metadata
                        sendMsg({ type: "transfer_received" });
                    }
                } catch (err) {
                    console.error(err);
                    log("Failed to assemble file");
                    setDownloadProgress(null);
                }
                return;
            }

            if (msg.type === "text_message") {
                const senderId = msg.from;
                const peerKey = peerKeysRef.current.get(senderId) || aesKeyRef.current;

                if (!peerKey) {
                    log("Can't decrypt text yet (no shared key)");
                    return;
                }

                // Decrypt metadata to get text
                if (!msg.encrypted_metadata || !msg.metadata_iv) {
                    console.error(
                        "Missing encrypted metadata for text message",
                    );
                    log("Missing encrypted metadata for text message");
                    return;
                }

                try {
                    // Decrypt metadata
                    const metadataIV = base64ToUint8(msg.metadata_iv);
                    const encryptedMetadata = base64ToUint8(
                        msg.encrypted_metadata,
                    );
                    const metadataBytes = await decryptBytes(
                        peerKey,
                        metadataIV,
                        encryptedMetadata,
                    );
                    const metadataJSON = new TextDecoder().decode(
                        metadataBytes,
                    );
                    const metadata = JSON.parse(metadataJSON);

                    // Display the text
                    if (metadata.is_text && metadata.text) {
                        setReceivedText(metadata.text);
                        setShowTextModal(true);
                        log("Received text message");

                        // Send transfer received confirmation to sender with encrypted metadata
                        try {
                            const transferMetadata = {
                                transfer_type: "text",
                            };
                            const metadataJSON = JSON.stringify(transferMetadata);
                            const metadataBytes = new TextEncoder().encode(metadataJSON);
                            const { iv: metadataIV, ciphertext: encryptedMetadataBytes } =
                                await encryptBytes(peerKey, metadataBytes);

                            sendMsg({
                                type: "transfer_received",
                                encrypted_metadata: uint8ToBase64(encryptedMetadataBytes),
                                metadata_iv: uint8ToBase64(metadataIV),
                                recipients: [senderId]
                            });
                        } catch (err) {
                            console.error("Failed to encrypt transfer_received metadata:", err);
                            // Fall back to sending without metadata
                            sendMsg({ type: "transfer_received" });
                        }
                    }
                } catch (err) {
                    console.error("Failed to decrypt text message:", err);
                    log("Failed to decrypt text message");
                }
                return;
            }
        };

        ws.onclose = () => {
            log("WebSocket closed");
            setConnected(false);
            setPeerCount(1);
            setStatus("Not connected");

            // If we were in a room, attempt to reconnect
            if (roomId) {
                log(`Connection lost, attempting to reconnect to room ${roomId}`);

                // Reset peer state
                setPeerMnemonic(null);
                havePeerPubRef.current = false;
                aesKeyRef.current = null;
                setHasAesKey(false);

                // Attempt to reconnect after a short delay
                setTimeout(() => {
                    log(`Reconnecting to room ${roomId}`);
                    connectToRoom();
                }, 1000);
            }
        };

        ws.onerror = (err) => {
            console.error("WS error", err);
            log("WebSocket error");
        };
    }, [roomId]);

    // Handler for the connect button - redirects to the room page
    function handleConnect() {
        let room = roomId.trim().toLowerCase();

        // Generate random room ID if empty
        if (!room) {
            room = generateRandomRoomId();
        }

        // Validate room ID length (minimum 4 characters)
        if (room.length < 4) {
            setRoomIdError(
                "Room ID must be at least 4 characters. Please enter a longer room name.",
            );
            return;
        }

        // Clear any previous errors and redirect to the room page
        setRoomIdError(null);
        window.location.href = `/${room}`;
    }

    // Helper function to zip a folder
    async function zipFolder(files, folderName) {
        const zip = new JSZip();
        const folder = zip.folder(folderName);

        // Add all files to the zip
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Get relative path (remove the folder name prefix if present)
            let relativePath = file.webkitRelativePath || file.name;

            // Remove the first folder component to get relative path within the folder
            const parts = relativePath.split("/");
            if (parts.length > 1) {
                relativePath = parts.slice(1).join("/");
            }

            folder.file(relativePath, file);
        }

        // Generate the zip blob
        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });

        return zipBlob;
    }

    async function handleFileSelect(e) {
        const files = e.target.files;
        if (!files || files.length === 0 || !aesKeyRef.current) {
            log("No file or key not ready");
            return;
        }

        log(`Selected ${files.length} file(s)`);
        for (let i = 0; i < files.length; i++) {
            log(
                `  File ${i + 1}: ${files[i].name}, webkitRelativePath: ${files[i].webkitRelativePath || "(none)"}`,
            );
        }

        try {
            let fileToSend;
            let isFolder = false;
            let isMultipleFiles = false;
            let originalFolderName = null;

            // Check if this is a folder (files with webkitRelativePath) or multiple individual files
            if (
                files.length > 1 ||
                (files.length === 1 && files[0].webkitRelativePath)
            ) {
                // Get folder name from the first file's path, or detect multiple files
                if (files[0].webkitRelativePath) {
                    // Real folder with directory structure
                    isFolder = true;
                    originalFolderName =
                        files[0].webkitRelativePath.split("/")[0];
                } else {
                    // Multiple individual files selected (not a folder)
                    isMultipleFiles = true;
                    originalFolderName = "files";
                }

                log(
                    `Zipping ${isFolder ? "folder" : "files"} "${originalFolderName}" (${files.length} files)...`,
                );
                const zipBlob = await zipFolder(files, originalFolderName);

                if (!zipBlob || zipBlob.size === 0) {
                    log("Error: zip file is empty");
                    setUploadProgress(null);
                    return;
                }

                fileToSend = new File([zipBlob], originalFolderName + ".zip", {
                    type: "application/zip",
                });
                log(
                    `${isFolder ? "Folder" : "Files"} zipped successfully (${formatBytes(zipBlob.size)})`,
                );
            } else {
                // Single file
                fileToSend = files[0];
            }

            const startTime = Date.now();
            const displayName =
                isFolder || isMultipleFiles
                    ? originalFolderName
                    : fileToSend.name;
            setUploadProgress({
                percent: 0,
                speed: 0,
                eta: 0,
                startTime,
                fileName: displayName,
            });

            const typeLabel = isFolder
                ? "folder"
                : isMultipleFiles
                    ? "files"
                    : "file";
            log(
                `Streaming ${typeLabel} "${displayName}" (${formatBytes(fileToSend.size)})`,
            );

            // Calculate SHA256 hash of the file
            const fileBuffer = await fileToSend.arrayBuffer();
            const fileHash = await calculateSHA256(fileBuffer);
            log(
                `Calculated hash: ${fileHash.substring(0, 8)}...${fileHash.substring(fileHash.length - 8)}`,
            );

            // Create metadata object
            const metadata = {
                name: fileToSend.name,
                total_size: fileToSend.size,
                hash: fileHash,
            };

            if (isFolder) {
                metadata.is_folder = true;
                metadata.original_folder_name = originalFolderName;
            } else if (isMultipleFiles) {
                metadata.is_multiple_files = true;
            }

            // Determine targets (similar to file logic)
            let targetPeers = [];
            if (initialRecipients.length > 0) {
                targetPeers = initialRecipients.filter(id => peerKeysRef.current.has(id));
            } else {
                targetPeers = Array.from(peerKeysRef.current.keys());
            }

            // Fallback or broadcast
            if (targetPeers.length === 0 && peerKeysRef.current.size > 0 && initialRecipients.length === 0) {
                targetPeers = Array.from(peerKeysRef.current.keys());
            }

            // Encrypt metadata
            const metadataJSON = JSON.stringify(metadata);
            const metadataBytes = new TextEncoder().encode(metadataJSON);

            if (targetPeers.length === 0 && aesKeyRef.current) {
                // Legacy single peer
                const { iv: metadataIV, ciphertext: encryptedMetadataBytes } =
                    await encryptBytes(aesKeyRef.current, metadataBytes);

                const fileStartMsg = {
                    type: "file_start",
                    encrypted_metadata: uint8ToBase64(encryptedMetadataBytes),
                    metadata_iv: uint8ToBase64(metadataIV),
                };
                sendMsg(fileStartMsg);
            } else {
                // Multi-peer loop
                for (const peerId of targetPeers) {
                    const peerKey = peerKeysRef.current.get(peerId);
                    if (!peerKey) continue;

                    const { iv: metadataIV, ciphertext: encryptedMetadataBytes } =
                        await encryptBytes(peerKey, metadataBytes);

                    sendMsg({
                        type: "file_start",
                        encrypted_metadata: uint8ToBase64(encryptedMetadataBytes),
                        metadata_iv: uint8ToBase64(metadataIV),
                        recipients: [peerId]
                    });
                }
            }

            // Reset ACK tracking
            pendingChunksRef.current = new Map();
            ackReceivedRef.current = new Set();
            lastActivityTimeRef.current = Date.now();

            // Setup retransmission logic
            const maxRetries = 3;
            const ackTimeout = 5000; // 5 seconds
            const transferTimeout = 30000; // 30 seconds
            let sendingComplete = false;

            // Start retransmission checker
            retransmitTimerRef.current = setInterval(() => {
                const now = Date.now();

                // Check for transfer timeout
                if (now - lastActivityTimeRef.current > transferTimeout) {
                    clearInterval(retransmitTimerRef.current);
                    retransmitTimerRef.current = null;
                    log("Transfer timeout: no activity for 30 seconds");
                    setUploadProgress(null);
                    return;
                }

                // Check pending chunks for retransmission
                for (const [
                    chunkNum,
                    chunkInfo,
                ] of pendingChunksRef.current.entries()) {
                    if (now - chunkInfo.sentTime > ackTimeout) {
                        if (chunkInfo.retries >= maxRetries) {
                            clearInterval(retransmitTimerRef.current);
                            retransmitTimerRef.current = null;
                            log(
                                `Failed to send chunk ${chunkNum} after ${maxRetries} retries`,
                            );
                            setUploadProgress(null);
                            return;
                        }

                        // Resend chunk
                        sendMsg({
                            type: "file_chunk",
                            chunk_num: chunkNum,
                            chunk_data: chunkInfo.chunkData,
                            iv_b64: chunkInfo.ivB64,
                        });
                        chunkInfo.sentTime = now;
                        chunkInfo.retries++;
                        lastActivityTimeRef.current = now;
                    }
                }
            }, 500);

            // Stream file in chunks, encrypting each chunk individually
            const chunkSize = 512 * 1024;
            let sentBytes = 0;
            let chunkNum = 0;

            // Use File stream API for memory-efficient reading
            const stream = fileToSend.stream();
            const reader = stream.getReader();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Determine target peers
                    let targetPeers = [];
                    if (initialRecipients.length > 0) {
                        targetPeers = initialRecipients.filter(id => peerKeysRef.current.has(id));
                    } else {
                        targetPeers = Array.from(peerKeysRef.current.keys());
                    }

                    if (targetPeers.length === 0 && peerKeysRef.current.size > 0 && initialRecipients.length === 0) {
                        // Fallback for logic where initialRecipients is empty but we have peers (Broadcast)
                        targetPeers = Array.from(peerKeysRef.current.keys());
                    }

                    // If we still have no targets, check legacy aesKey (1-to-1 fallback)
                    if (targetPeers.length === 0 && aesKeyRef.current) {
                        // Legacy single peer mode
                        const { iv, ciphertext } = await encryptBytes(
                            aesKeyRef.current,
                            value,
                        );
                        const chunkData = uint8ToBase64(ciphertext);
                        const ivB64 = uint8ToBase64(iv);
                        pendingChunksRef.current.set(chunkNum, {
                            chunkData: chunkData,
                            ivB64: ivB64,
                            sentTime: Date.now(),
                            retries: 0,
                        });
                        sendMsg({
                            type: "file_chunk",
                            chunk_num: chunkNum,
                            chunk_data: chunkData,
                            iv_b64: ivB64,
                        });
                    } else {
                        // Multi-peer mode: Encrypt and send for EACH target
                        const activeRecipients = [];

                        for (const peerId of targetPeers) {
                            const peerKey = peerKeysRef.current.get(peerId);
                            if (!peerKey) continue;

                            const { iv, ciphertext } = await encryptBytes(
                                peerKey,
                                value,
                            );
                            const chunkData = uint8ToBase64(ciphertext);
                            const ivB64 = uint8ToBase64(iv);

                            // Send to specific recipient
                            sendMsg({
                                type: "file_chunk",
                                chunk_num: chunkNum,
                                chunk_data: chunkData,
                                iv_b64: ivB64,
                                recipients: [peerId] // Relay supports this field
                            });
                            activeRecipients.push(peerId);
                        }

                        // We track the *last* sent chunk for ARQ purposes (simplified)
                        if (activeRecipients.length > 0) {
                            pendingChunksRef.current.set(chunkNum, {
                                sentTime: Date.now(),
                                retries: 0,
                                // We don't store data here to save memory in broadcast
                            });
                        }
                    }

                    sentBytes += value.length;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = elapsed > 0 ? sentBytes / elapsed : 0;
                    const percent = Math.round(
                        (sentBytes / fileToSend.size) * 100,
                    );

                    const remainingBytes = fileToSend.size - sentBytes;
                    const eta = speed > 0 ? remainingBytes / speed : 0;

                    setUploadProgress({
                        percent,
                        speed,
                        eta,
                        startTime,
                        fileName: displayName,
                    });

                    chunkNum++;
                    lastActivityTimeRef.current = Date.now();

                    // Small delay to allow UI updates
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            } finally {
                reader.releaseLock();
            }

            sendingComplete = true;

            // Wait for all chunks to be acknowledged
            const waitStart = Date.now();
            while (pendingChunksRef.current.size > 0) {
                if (Date.now() - waitStart > 30000) {
                    clearInterval(retransmitTimerRef.current);
                    retransmitTimerRef.current = null;
                    log("Timeout waiting for chunk acknowledgments");
                    setUploadProgress(null);
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Stop retransmission checker
            clearInterval(retransmitTimerRef.current);
            retransmitTimerRef.current = null;

            // Send file_end message
            sendMsg({
                type: "file_end",
            });

            const elapsed = (Date.now() - startTime) / 1000;
            const speed = fileToSend.size / elapsed;
            setUploadProgress({
                percent: 100,
                speed,
                eta: 0,
                fileName: displayName,
            });

            log(`Sent encrypted ${typeLabel} "${displayName}"`);
        } catch (err) {
            console.error(err);
            log("Failed to send " + (err.message || "file"));
            setUploadProgress(null);
        }
    }

    async function handleTextSend() {
        if (!textInput.trim() || !aesKeyRef.current) {
            return;
        }

        try {
            log(`Sending text message`);

            // Create metadata with text
            const metadata = {
                is_text: true,
                text: textInput,
            };

            // Determine targets (similar to file logic)
            let targetPeers = [];
            if (initialRecipients.length > 0) {
                targetPeers = initialRecipients.filter(id => peerKeysRef.current.has(id));
            } else {
                targetPeers = Array.from(peerKeysRef.current.keys());
            }

            // Fallback or broadcast
            if (targetPeers.length === 0 && peerKeysRef.current.size > 0 && initialRecipients.length === 0) {
                targetPeers = Array.from(peerKeysRef.current.keys());
            }

            if (targetPeers.length === 0 && aesKeyRef.current) {
                // Legacy single peer
                const { iv: metadataIV, ciphertext: encryptedMetadataBytes } =
                    await encryptBytes(aesKeyRef.current, metadataBytes);

                const textMsg = {
                    type: "text_message",
                    encrypted_metadata: uint8ToBase64(encryptedMetadataBytes),
                    metadata_iv: uint8ToBase64(metadataIV),
                };
                sendMsg(textMsg);
            } else {
                // Multi-peer loop
                for (const peerId of targetPeers) {
                    const peerKey = peerKeysRef.current.get(peerId);
                    if (!peerKey) continue;

                    const { iv: metadataIV, ciphertext: encryptedMetadataBytes } =
                        await encryptBytes(peerKey, metadataBytes);

                    sendMsg({
                        type: "text_message",
                        encrypted_metadata: uint8ToBase64(encryptedMetadataBytes),
                        metadata_iv: uint8ToBase64(metadataIV),
                        recipients: [peerId]
                    });
                }
            }

            log(`Sent encrypted text`);

            // Clear the input
            setTextInput("");

            // Show success notification
            toast.success("Text sent!", { duration: 2000 });
        } catch (err) {
            console.error(err);
            log("Failed to send text: " + (err.message || "unknown error"));
            toast.error("Failed to send text");
        }
    }

    // Drag and drop handlers
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (hasAesKey) {
            setIsDragging(true);
        }
    }

    function handleDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        if (hasAesKey) {
            setIsDragging(true);
        }
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        // Only set to false if leaving the label element itself
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    }

    async function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!hasAesKey) return;

        const items = e.dataTransfer?.items;
        if (!items || items.length === 0) return;

        try {
            const allFiles = [];
            let folderName = null;
            let isFolder = false;

            // Process each dropped item
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === "file") {
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        if (entry.isDirectory) {
                            isFolder = true;
                            folderName = entry.name;
                            // Read all files from the directory
                            const dirFiles = await readDirectory(
                                entry,
                                entry.name,
                            );
                            allFiles.push(...dirFiles);
                        } else if (entry.isFile) {
                            const file = item.getAsFile();
                            if (file) {
                                allFiles.push(file);
                            }
                        }
                    }
                }
            }

            if (allFiles.length > 0) {
                // Create a FileList-like object with webkitRelativePath set for folder files
                const fileList = {
                    length: allFiles.length,
                    item: (index) => allFiles[index],
                    [Symbol.iterator]: function* () {
                        for (let i = 0; i < allFiles.length; i++) {
                            yield allFiles[i];
                        }
                    },
                };

                // Add indexed properties
                for (let i = 0; i < allFiles.length; i++) {
                    fileList[i] = allFiles[i];
                }

                const syntheticEvent = {
                    target: {
                        files: fileList,
                    },
                };
                handleFileSelect(syntheticEvent);
            }
        } catch (err) {
            console.error("Error processing dropped items:", err);
            log("Failed to process dropped items");
        }
    }

    // Helper function to recursively read directory contents
    async function readDirectory(dirEntry, basePath = "") {
        const files = [];
        const reader = dirEntry.createReader();

        return new Promise((resolve, reject) => {
            const readEntries = () => {
                reader.readEntries(async (entries) => {
                    if (entries.length === 0) {
                        resolve(files);
                        return;
                    }

                    for (const entry of entries) {
                        if (entry.isFile) {
                            const file = await new Promise((res, rej) => {
                                entry.file((f) => {
                                    // Create a new File object with webkitRelativePath set
                                    const path = basePath
                                        ? `${basePath}/${f.name}`
                                        : f.name;
                                    const newFile = new File([f], f.name, {
                                        type: f.type,
                                        lastModified: f.lastModified,
                                    });
                                    Object.defineProperty(
                                        newFile,
                                        "webkitRelativePath",
                                        {
                                            value: path,
                                            writable: false,
                                        },
                                    );
                                    res(newFile);
                                }, rej);
                            });
                            files.push(file);
                        } else if (entry.isDirectory) {
                            const subPath = basePath
                                ? `${basePath}/${entry.name}`
                                : entry.name;
                            const subFiles = await readDirectory(
                                entry,
                                subPath,
                            );
                            files.push(...subFiles);
                        }
                    }

                    // Continue reading (directories may have many entries)
                    readEntries();
                }, reject);
            };

            readEntries();
        });
    }

    // Handler to confirm and trigger file download
    function handleConfirmDownload() {
        if (!pendingDownload) return;

        // Trigger browser download
        const a = document.createElement("a");
        a.href = pendingDownload.url;
        a.download = pendingDownload.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Update state
        setDownloadUrl(pendingDownload.url);
        setDownloadName(pendingDownload.name);
        setShowDownloadConfirmModal(false);

        log(`Download started: "${pendingDownload.name}"`);
    }

    // Handler to cancel file download
    function handleCancelDownload() {
        if (pendingDownload) {
            // Clean up the blob URL to free memory
            URL.revokeObjectURL(pendingDownload.url);
            setPendingDownload(null);
        }
        setShowDownloadConfirmModal(false);
        log("Download cancelled");
    }

    useEffect(() => {
        return () => {
            if (wsRef.current && wsRef.current.readyState === 1) {
                wsRef.current.close();
            }
        };
    }, []);

    // Auto-connect if room is in URL
    useEffect(() => {
        if (pathRoom && !connected) {
            connectToRoom();
        }
    }, [pathRoom, connected, connectToRoom]);

    // Update page title based on room
    useEffect(() => {
        document.title = roomId ? `e2ecp · ${roomId.toUpperCase()}` : "e2ecp";
    }, [roomId]);

    // Auto-focus room input on page load if no room in URL
    useEffect(() => {
        if (!pathRoom && !connected && roomInputRef.current) {
            roomInputRef.current.focus();
        }
    }, []);

    return (
        <div className="min-h-screen bg-white dark:bg-black transition-colors duration-200">
            <Navbar title="e2ecp" />
            <div className="p-2 sm:p-4 md:p-8 flex flex-col items-center justify-center">
                <div className="max-w-4xl w-full flex-grow flex flex-col justify-center">
                    {/* Header */}
                    <div
                        className="glass dark:glass-dark rounded-3xl p-6 sm:p-8 mb-6 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 transition-all duration-300 shadow-2xl shadow-black/5"
                    >
                        <div className="flex-1 text-center sm:text-left w-full">
                            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter mb-2 bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                                <a
                                    href="/"
                                    className="no-underline hover:opacity-80 transition-opacity"
                                >
                                    TRANSFER
                                </a>
                            </h1>
                            <p className="text-sm sm:text-lg font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">
                                End-to-End Encrypted File Relay
                            </p>

                            <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4">
                                <div className="flex items-center gap-3">
                                    <IconBadge
                                        mnemonic={myMnemonic}
                                        label="You"
                                        className="shrink-0 scale-90 sm:scale-100"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-primary-500 uppercase tracking-widest opacity-60">SENDER</span>
                                        <span className="text-xs font-bold text-gray-500 truncate max-w-[100px]">{myMnemonic}</span>
                                    </div>
                                </div>

                                {Array.from(peers.values()).length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-4">
                                        <i className="fas fa-arrow-right text-primary-500/50 hidden sm:block"></i>
                                        {Array.from(peers.values()).map((peer) => (
                                            <div key={peer.id} className="flex items-center gap-3">
                                                <IconBadge
                                                    mnemonic={peer.mnemonic}
                                                    label="Peer"
                                                    className="shrink-0 scale-90 sm:scale-100"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-green-500 uppercase tracking-widest opacity-60">READY</span>
                                                    <span className="text-xs font-bold text-gray-500 truncate max-w-[100px]">{peer.mnemonic}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 opacity-40 grayscale">
                                        <i className="fas fa-arrow-right text-gray-400"></i>
                                        <div className="w-10 h-10 rounded-2xl border-2 border-dashed border-gray-400 flex items-center justify-center">
                                            <i className="fas fa-user-plus text-xs"></i>
                                        </div>
                                        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">WAITING...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {myMnemonic && !peerMnemonic && roomId && (
                            <div className="flex-shrink-0 animate-in fade-in zoom-in duration-500">
                                <div className="p-3 bg-white rounded-2xl shadow-xl shadow-black/10">
                                    <QRCodeSVG
                                        value={`${window.location.origin}/${roomId}`}
                                        size={100}
                                        level="M"
                                        fgColor="#111827"
                                        bgColor="#ffffff"
                                        className="rounded-lg"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Connection Panel - only show on home page */}
                    {!pathRoom && (
                        <div className="card p-6 sm:p-8 mb-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                                <input
                                    ref={roomInputRef}
                                    type="text"
                                    placeholder="Enter Room Code..."
                                    value={roomId}
                                    disabled={connected}
                                    onChange={(e) => {
                                        setRoomId(e.target.value);
                                        setRoomIdError(null);
                                    }}
                                    onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        !connected &&
                                        handleConnect()
                                    }
                                    className={`input-field text-lg ${roomIdError ? "border-red-500/50 ring-2 ring-red-500/20" : ""}`}
                                />
                                <button
                                    onClick={handleConnect}
                                    disabled={connected}
                                    className={`btn-primary px-8 text-base tracking-widest whitespace-nowrap h-[54px] ${connected ? "opacity-30 cursor-not-allowed" : ""}`}
                                >
                                    {connected ? "CONNECTED" : "CONNECT ROOM"}
                                </button>
                            </div>
                            <div
                                className={`rounded-xl p-4 font-bold text-sm sm:text-base break-words transition-all duration-300 flex items-center gap-3 ${roomIdError ? "bg-red-500/10 text-red-600 border border-red-500/20" : "bg-primary-500/5 text-primary-600 border border-primary-500/10"}`}
                            >
                                <i className={`fas ${roomIdError ? "fa-exclamation-triangle" : "fa-shield-halved"}`}></i>
                                <span>
                                    {roomIdError ? (
                                        <>ERROR: {roomIdError.toUpperCase()}</>
                                    ) : (
                                        <>STATUS: {status.toUpperCase()}</>
                                    )}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* File Transfer Panel */}
                    {connected && (
                        <div className="card p-6 sm:p-8 mb-6 animate-in slide-in-from-bottom-8 duration-700">
                            {uploadProgress && (
                                <ProgressBar
                                    progress={uploadProgress}
                                    label={`Sending ${uploadProgress.fileName}`}
                                />
                            )}

                            {downloadProgress && (
                                <ProgressBar
                                    progress={downloadProgress}
                                    label={`Receiving ${downloadProgress.fileName}`}
                                />
                            )}

                            <div
                                className={`rounded-3xl p-8 sm:p-12 text-center transition-all duration-300 border-2 border-dashed ${hasAesKey
                                    ? isDragging
                                        ? "bg-primary-500/10 border-primary-500 scale-[1.02] shadow-2xl shadow-primary-500/10"
                                        : "bg-gray-50/50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-primary-400/50"
                                    : "bg-gray-100/50 dark:bg-black/20 border-gray-200/50 dark:border-white/5 opacity-50"
                                    }`}
                                onDragOver={handleDragOver}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                {hasAesKey ? (
                                    isDragging ? (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center text-white text-3xl animate-bounce">
                                                <i className="fas fa-file-arrow-up"></i>
                                            </div>
                                            <div className="font-black uppercase tracking-tight text-2xl text-primary-600 dark:text-primary-400">
                                                Drop to Securely Send
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="max-w-md mx-auto">
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                className="hidden"
                                                onChange={handleFileSelect}
                                                disabled={!hasAesKey}
                                                multiple
                                            />

                                            <div className="flex flex-col items-center gap-6">
                                                <div
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="w-24 h-24 rounded-[30px] bg-linear-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-4xl shadow-xl shadow-primary-500/30 cursor-pointer hover:scale-110 active:scale-95 transition-all group"
                                                >
                                                    <i className="fas fa-plus group-hover:rotate-90 transition-transform duration-300"></i>
                                                </div>

                                                <div className="space-y-2">
                                                    <p className="text-xl font-black text-gray-900 dark:text-white">ENCRYPTED TRANSFER</p>
                                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Select files or drag & drop</p>
                                                </div>

                                                {/* Text input section */}
                                                <div className="w-full mt-4 pt-8 border-t border-gray-100 dark:border-white/5">
                                                    <div className="flex gap-3">
                                                        <input
                                                            type="text"
                                                            value={textInput}
                                                            onChange={(e) =>
                                                                setTextInput(
                                                                    e.target.value,
                                                                )
                                                            }
                                                            onKeyDown={(e) =>
                                                                e.key === "Enter" &&
                                                                handleTextSend()
                                                            }
                                                            placeholder="Send a secure snippet..."
                                                            disabled={!hasAesKey}
                                                            className="flex-1 input-field"
                                                        />
                                                        <button
                                                            onClick={handleTextSend}
                                                            disabled={
                                                                !hasAesKey ||
                                                                !textInput.trim()
                                                            }
                                                            className="btn-primary w-14 shrink-0 flex items-center justify-center"
                                                        >
                                                            <i className="fas fa-paper-plane"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex flex-col items-center gap-4 py-4">
                                        <div className="w-16 h-16 rounded-full border-4 border-gray-300 border-t-primary-500 animate-spin mb-2"></div>
                                        <div className="space-y-1">
                                            <p className="font-black text-gray-400 uppercase tracking-widest text-sm">Waiting for connection...</p>
                                            <p className="text-xs text-gray-500 font-bold max-w-[200px] mx-auto opacity-70">Share the link above to start the secure exchange</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {downloadUrl && (
                                <div className="mt-6 glass dark:glass-dark rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4">
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className="w-12 h-12 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center text-xl shrink-0">
                                            <i className="fas fa-check-circle"></i>
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">FILE READY</span>
                                            <span className="text-sm font-bold truncate dark:text-white" title={downloadName}>{downloadName}</span>
                                        </div>
                                    </div>
                                    <a
                                        href={downloadUrl}
                                        download={downloadName}
                                        className="btn-primary flex items-center gap-2 whitespace-nowrap w-full sm:w-auto justify-center"
                                    >
                                        <i className="fas fa-download"></i>
                                        DOWNLOAD
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Error Modal */}
                {showErrorModal && (
                    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300">
                        <div className="card p-8 max-w-md w-full text-center">
                            <div className="w-20 h-20 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-3xl mx-auto mb-6">
                                <i className="fas fa-exclamation-triangle"></i>
                            </div>
                            <h2 className="text-2xl font-black mb-3 uppercase tracking-tighter text-black dark:text-white">
                                LIMIT REACHED
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 font-bold mb-8">
                                Maximum rooms active. Please try again later.
                            </p>
                            <button
                                onClick={() => {
                                    setShowErrorModal(false);
                                    setRoomId("");
                                }}
                                className="btn-primary w-full"
                            >
                                CONTINUE
                            </button>
                        </div>
                    </div>
                )}

                {/* About Modal */}
                {showAboutModal && (
                    <div
                        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300"
                        onClick={() => setShowAboutModal(false)}
                    >
                        <div
                            className="card p-8 max-w-lg w-full text-black dark:text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-center">
                                SECURE EXCHANGE
                            </h2>
                            <p className="text-base font-bold text-gray-500 dark:text-gray-400 mb-4 text-center">
                                Direct end-to-end encrypted transfers via a zero-knowledge relay. No data is stored on the server.
                            </p>
                            <div className="bg-primary-500/5 rounded-2xl p-6 mb-6 border border-primary-500/10 text-center">
                                <p className="text-xs font-black text-primary-500 uppercase tracking-widest mb-2">CLI ACCESS</p>
                                <code className="text-sm font-mono font-bold text-primary-600 dark:text-primary-400 break-all select-all">
                                    curl https://e2ecp.com | bash
                                </code>
                            </div>
                            <div className="flex justify-center gap-6 mb-8">
                                <a
                                    href="https://github.com/schollz/e2ecp"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-primary-500 transition-colors text-3xl"
                                    aria-label="View on GitHub"
                                >
                                    <i className="fab fa-github"></i>
                                </a>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAboutModal(false)}
                                className="btn-secondary w-full"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}

                {/* Download Confirmation Modal */}
                {showDownloadConfirmModal && pendingDownload && (
                    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300">
                        <div
                            className="card p-8 max-w-lg w-full text-black dark:text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-3xl font-black uppercase tracking-tighter mb-6 text-center">
                                RECEIVE FILE?
                            </h2>
                            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-6 mb-6 border border-gray-100 dark:border-white/5 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">NAME</span>
                                    <span className="text-sm font-bold truncate ml-4">{pendingDownload.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">TYPE</span>
                                    <span className="text-sm font-bold">{pendingDownload.type.toUpperCase()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SIZE</span>
                                    <span className="text-sm font-bold">{pendingDownload.size}</span>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    type="button"
                                    onClick={handleCancelDownload}
                                    className="btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmDownload}
                                    className="btn-primary flex-1"
                                >
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Text Message Modal */}
                {showTextModal && receivedText && (
                    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                        <div
                            className="card p-8 max-w-lg w-full text-black dark:text-white"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-3xl font-black uppercase tracking-tighter mb-6 text-center">
                                ENCRYPTED TEXT
                            </h2>
                            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-6 mb-6 border border-gray-100 dark:border-white/5 relative group">
                                <div className="text-sm font-mono font-medium leading-relaxed break-words whitespace-pre-wrap max-h-96 overflow-y-auto pr-8">
                                    {receivedText}
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard
                                            .writeText(receivedText)
                                            .then(() => {
                                                toast.success(
                                                    "Copied to clipboard",
                                                );
                                            })
                                            .catch((err) => {
                                                toast.error("Failed to copy");
                                                console.error(
                                                    "Failed to copy:",
                                                    err,
                                                );
                                            });
                                    }}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-primary-500 transition-colors"
                                    title="Copy to clipboard"
                                    type="button"
                                >
                                    <i className="fas fa-copy"></i>
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowTextModal(false);
                                    setReceivedText(null);
                                }}
                                className="btn-secondary w-full"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
