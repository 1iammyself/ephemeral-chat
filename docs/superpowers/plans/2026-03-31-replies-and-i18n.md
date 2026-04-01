# Message Replies Polish + i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real gaps in the already-wired message replies feature, then build i18n from scratch (react-i18next, EN/FR/ES, language switcher, and hook up all major components).

**Architecture:** Message replies already have full UI — fixes are targeted edits to 3 send paths and the reply content builder. i18n uses react-i18next with JSON translation files under `client/src/locales/`, a singleton `i18n.js` init file, and `useTranslation` hooks dropped into each component.

**Tech Stack:** React 18, react-i18next 14, i18next 23, i18next-browser-languagedetector 8, i18next-http-backend (optional/skipped in favour of static imports for offline PWA support).

---

## Part A — Message Replies: Gap Fixes

### Discovered gaps
The core reply system is fully implemented (state, banner, quote bubble, thread count, ThreadView). Three narrow gaps remain:
1. `game` and `file` message types not handled in reply content builder → sends raw JSON/base64 as preview.
2. Image/file send path (line 2477) omits `replyTo`.
3. Audio send path (line 2649) omits `replyTo`.

---

### Task A1: Fix reply content builder for game/file types

**Files:**
- Modify: `client/src/components/ChatRoom.jsx` (lines 2036–2040)

- [ ] **Step 1: Open ChatRoom.jsx and update the reply content builder**

Find (lines 2036–2040):
```js
const replyData = replyingTo ? {
  id: replyingTo.id,
  content: replyingTo.messageType === 'image' ? 'Image' : replyingTo.messageType === 'audio' ? 'Voice Note' : replyingTo.content,
  sender: replyingTo.sender.nickname
} : null;
```

Replace with:
```js
const replyData = replyingTo ? {
  id: replyingTo.id,
  content: (() => {
    switch (replyingTo.messageType) {
      case 'image': return 'Image';
      case 'audio': return 'Voice Note';
      case 'file': return replyingTo.fileName || 'File';
      case 'game': return replyingTo.gameData?.gameType
        ? `Game: ${replyingTo.gameData.gameType.replace(/-/g, ' ')}`
        : 'Game';
      case 'poll': return replyingTo.pollData?.question || 'Poll';
      default: return replyingTo.content;
    }
  })(),
  sender: replyingTo.sender.nickname
} : null;
```

- [ ] **Step 2: Commit**
```bash
git add client/src/components/ChatRoom.jsx
git commit -m "fix: readable reply preview for game/file/poll message types"
```

---

### Task A2: Add replyTo to image/file send path

**Files:**
- Modify: `client/src/components/ChatRoom.jsx` (lines 2474–2490)

- [ ] **Step 1: Find the socket.IO fallback image/file send**

Find (around line 2477):
```js
socketManager.emit('send-message', {
  ...v2Payload,
  messageType: isImage ? 'image' : 'file',
  imageData: isImage ? v2Payload.ct : undefined,
  isEncrypted: true,
  isViewOnce,
  fileName: file.name,
  mimeType: file.type,
  fileSize: file.size,
  recipients: selectedRecipients,
  isAnonymous: isAnonymousMode
});
```

Replace with:
```js
socketManager.emit('send-message', {
  ...v2Payload,
  messageType: isImage ? 'image' : 'file',
  imageData: isImage ? v2Payload.ct : undefined,
  isEncrypted: true,
  isViewOnce,
  fileName: file.name,
  mimeType: file.type,
  fileSize: file.size,
  recipients: selectedRecipients,
  isAnonymous: isAnonymousMode,
  replyTo: replyingTo ? {
    id: replyingTo.id,
    content: replyingTo.messageType === 'image' ? 'Image'
      : replyingTo.messageType === 'audio' ? 'Voice Note'
      : replyingTo.content,
    sender: replyingTo.sender.nickname
  } : null
});
```

Also clear the reply state after this send — add `setReplyingTo(null);` right after `setIsUploading(false);` at line ~2491.

- [ ] **Step 2: Also clear replyingTo for view-once image path (around line 2424)**

Find the view-once block:
```js
socketManager.emit('send-message', {
  ...voPayload,
  messageType: 'image',
  isViewOnce: true,
  recipients: selectedRecipients,
  isAnonymous: isAnonymousMode
});
setIsUploading(false);
return;
```

Replace with:
```js
socketManager.emit('send-message', {
  ...voPayload,
  messageType: 'image',
  isViewOnce: true,
  recipients: selectedRecipients,
  isAnonymous: isAnonymousMode,
  replyTo: replyingTo ? {
    id: replyingTo.id,
    content: replyingTo.messageType === 'image' ? 'Image'
      : replyingTo.messageType === 'audio' ? 'Voice Note'
      : replyingTo.content,
    sender: replyingTo.sender.nickname
  } : null
});
setReplyingTo(null);
setIsUploading(false);
return;
```

- [ ] **Step 3: Commit**
```bash
git add client/src/components/ChatRoom.jsx
git commit -m "fix: include replyTo in image/file send paths"
```

---

### Task A3: Add replyTo to audio send path

**Files:**
- Modify: `client/src/components/ChatRoom.jsx` (lines 2648–2656)

- [ ] **Step 1: Update audio emit**

Find (around line 2649):
```js
socketManager.emit('send-message', {
  ...v2Payload,
  messageType: 'audio',
  isEncrypted: true,
  isViewOnce: audioViewOnce,
  recipients: selectedRecipients
});
```

Replace with:
```js
socketManager.emit('send-message', {
  ...v2Payload,
  messageType: 'audio',
  isEncrypted: true,
  isViewOnce: audioViewOnce,
  recipients: selectedRecipients,
  replyTo: replyingTo ? {
    id: replyingTo.id,
    content: replyingTo.messageType === 'image' ? 'Image'
      : replyingTo.messageType === 'audio' ? 'Voice Note'
      : replyingTo.content,
    sender: replyingTo.sender.nickname
  } : null
});
setReplyingTo(null);
```

- [ ] **Step 2: Commit**
```bash
git add client/src/components/ChatRoom.jsx
git commit -m "fix: include replyTo in audio voice note send path"
```

---

## Part B — i18n: Full Implementation

### File map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `client/src/i18n.js` | i18next singleton init |
| Create | `client/src/locales/en/translation.json` | English strings |
| Create | `client/src/locales/fr/translation.json` | French strings |
| Create | `client/src/locales/es/translation.json` | Spanish strings |
| Modify | `client/src/main.jsx` | Import i18n before App |
| Modify | `client/src/components/Home.jsx` | Add useTranslation |
| Modify | `client/src/components/MessageList.jsx` | Add useTranslation |
| Modify | `client/src/components/ThreadView.jsx` | Add useTranslation |
| Modify | `client/src/components/ChatRoom.jsx` | Add useTranslation (key UI strings) |
| Create | `client/src/components/LanguageSwitcher.jsx` | Language picker UI |
| Modify | `client/src/components/Home.jsx` | Mount LanguageSwitcher in header |

---

### Task B1: Install dependencies

**Files:** `client/package.json`

- [ ] **Step 1: Install**
```bash
cd client && npm install i18next@^23 react-i18next@^14 i18next-browser-languagedetector@^8
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify in package.json**
```bash
grep -E "i18next|react-i18next" client/package.json
```
Expected: three matching lines.

---

### Task B2: Create i18n init file

**Files:**
- Create: `client/src/i18n.js`

- [ ] **Step 1: Write the file**

```js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import fr from './locales/fr/translation.json';
import es from './locales/es/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es }
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
```

---

### Task B3: Create English translation file

**Files:**
- Create: `client/src/locales/en/translation.json`

- [ ] **Step 1: Write the file**

```json
{
  "app": {
    "name": "Ephemeral Chat",
    "tagline": "Private, temporary conversations"
  },
  "home": {
    "join": "Join",
    "joining": "Joining...",
    "join_room": "Join Room",
    "join_with_code": "Join with Code",
    "verbal_code": "Verbal code",
    "verbal_code_placeholder": "four words here",
    "room_code_placeholder": "Room code",
    "create_room": "Create Room",
    "create_drop": "Create Drop",
    "claim_drop": "Claim Drop",
    "trace": "Trace",
    "invalid_room_code": "Please enter a valid 10-character room code",
    "room_not_found": "Room not found. Please check the room code.",
    "failed_to_check_room": "Failed to check room. Please try again.",
    "invalid_verbal_code": "Invalid or expired verbal code.",
    "invalid_verbal_format": "Please enter 4 words separated by spaces",
    "please_enter_verbal": "Please enter a verbal code",
    "features": {
      "realtime": "Real-Time Chat",
      "realtime_desc": "Instant messaging",
      "websocket": "WebSocket Powered",
      "websocket_desc": "Low-latency connections",
      "no_account": "No user account",
      "no_account_desc": "No registration needed",
      "nickname": "Pick Nickname",
      "nickname_desc": "Choose a name",
      "ephemeral": "Ephemeral",
      "ephemeral_desc": "Auto-delete messages",
      "private": "Private",
      "private_desc": "Optional passwords"
    }
  },
  "chat": {
    "no_messages": "No messages yet",
    "start_conversation": "Start the conversation!",
    "typing_one": "{{name}} is typing...",
    "typing_many": "{{names}} are typing...",
    "replying_to": "Replying to {{name}}",
    "image_label": "Image",
    "voice_note_label": "Voice Note",
    "file_label": "File",
    "game_label": "Game: {{type}}",
    "poll_label": "Poll",
    "sending_to": "Sending to {{count}} specific user",
    "sending_to_plural": "Sending to {{count}} specific users",
    "clear_selection": "Clear selection",
    "private_tag": "Private",
    "message_placeholder": "Message...",
    "send": "Send",
    "encryption_failed": "Encryption failed. Please rejoin the room.",
    "file_encryption_failed": "File encryption failed. Please rejoin the room.",
    "audio_encryption_failed": "Failed to encrypt audio.",
    "failed_to_send": "Failed to send message",
    "only_txt_files": "Only .txt files are supported",
    "admin_required": "Admin permission required for {{cmd}}",
    "recording_limit": "0:30",
    "stop_recording": "Stop",
    "cancel_recording": "Cancel",
    "send_voice": "Send",
    "voice_call_limit": "Voice calls are disabled in rooms with more than 7 users for stability.",
    "invalid_media_url": "Paste a YouTube or SoundCloud URL after /media",
    "tic_tac_toe_one_person": "Tic Tac Toe can only be sent to one person.",
    "chess_one_person": "Chess can only be sent to one person.",
    "rps_one_person": "Rock Paper Scissors can only be sent to one person."
  },
  "message": {
    "opened_view_once_photo": "Opened view-once photo",
    "opened_view_once_audio": "Opened view-once audio",
    "you_sent_photo": "You sent a photo",
    "view_once": "(View Once)",
    "edited": "edited",
    "reply": "Reply",
    "react": "React",
    "edit": "Edit",
    "delete": "Delete",
    "download": "Download",
    "copy": "Copy",
    "decryption_failed": "⚠️ Decryption failed",
    "expired": "expired",
    "vanishing": "vanishing"
  },
  "thread": {
    "reply_one": "{{count}} reply",
    "reply_other": "{{count}} replies",
    "reply_to_thread": "+ Reply to thread",
    "collapse": "Collapse"
  },
  "reactions": {
    "add": "Add reaction"
  },
  "poll": {
    "vote": "Vote",
    "results": "Results",
    "votes_count": "{{count}} vote",
    "votes_count_plural": "{{count}} votes"
  },
  "game": {
    "challenge_sent": "Game challenge sent!",
    "your_turn": "Your turn",
    "waiting": "Waiting for opponent...",
    "you_win": "You win! 🎉",
    "you_lose": "You lose",
    "draw": "Draw!",
    "rematch": "Rematch",
    "share": "Share result"
  },
  "modal": {
    "close": "Close",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "save": "Save",
    "done": "Done",
    "back": "Back",
    "next": "Next",
    "loading": "Loading..."
  },
  "room": {
    "leave": "Leave",
    "users": "Users",
    "topic": "Topic",
    "host": "Host",
    "you": "You",
    "connected": "Connected",
    "reconnecting": "Reconnecting...",
    "disconnected": "Disconnected"
  },
  "language": {
    "select": "Language",
    "en": "English",
    "fr": "Français",
    "es": "Español"
  }
}
```

---

### Task B4: Create French translation file

**Files:**
- Create: `client/src/locales/fr/translation.json`

- [ ] **Step 1: Write the file**

```json
{
  "app": {
    "name": "Ephemeral Chat",
    "tagline": "Conversations privées et temporaires"
  },
  "home": {
    "join": "Rejoindre",
    "joining": "Connexion...",
    "join_room": "Rejoindre le salon",
    "join_with_code": "Rejoindre avec un code",
    "verbal_code": "Code verbal",
    "verbal_code_placeholder": "quatre mots ici",
    "room_code_placeholder": "Code du salon",
    "create_room": "Créer un salon",
    "create_drop": "Créer un Drop",
    "claim_drop": "Récupérer un Drop",
    "trace": "Tracer",
    "invalid_room_code": "Veuillez entrer un code de salon valide à 10 caractères",
    "room_not_found": "Salon introuvable. Vérifiez le code.",
    "failed_to_check_room": "Impossible de vérifier le salon. Réessayez.",
    "invalid_verbal_code": "Code verbal invalide ou expiré.",
    "invalid_verbal_format": "Veuillez entrer 4 mots séparés par des espaces",
    "please_enter_verbal": "Veuillez entrer un code verbal",
    "features": {
      "realtime": "Chat en temps réel",
      "realtime_desc": "Messages instantanés",
      "websocket": "Propulsé par WebSocket",
      "websocket_desc": "Connexions à faible latence",
      "no_account": "Sans compte",
      "no_account_desc": "Aucune inscription nécessaire",
      "nickname": "Pseudo",
      "nickname_desc": "Choisissez un nom",
      "ephemeral": "Éphémère",
      "ephemeral_desc": "Suppression automatique",
      "private": "Privé",
      "private_desc": "Mots de passe optionnels"
    }
  },
  "chat": {
    "no_messages": "Aucun message",
    "start_conversation": "Lancez la conversation !",
    "typing_one": "{{name}} écrit...",
    "typing_many": "{{names}} écrivent...",
    "replying_to": "Répondre à {{name}}",
    "image_label": "Image",
    "voice_note_label": "Note vocale",
    "file_label": "Fichier",
    "game_label": "Jeu : {{type}}",
    "poll_label": "Sondage",
    "sending_to": "Envoi à {{count}} utilisateur",
    "sending_to_plural": "Envoi à {{count}} utilisateurs",
    "clear_selection": "Effacer la sélection",
    "private_tag": "Privé",
    "message_placeholder": "Message...",
    "send": "Envoyer",
    "encryption_failed": "Échec du chiffrement. Rejoignez le salon.",
    "file_encryption_failed": "Échec du chiffrement du fichier.",
    "audio_encryption_failed": "Échec du chiffrement audio.",
    "failed_to_send": "Échec de l'envoi",
    "only_txt_files": "Seuls les fichiers .txt sont pris en charge",
    "admin_required": "Permission admin requise pour {{cmd}}",
    "recording_limit": "0:30",
    "stop_recording": "Arrêter",
    "cancel_recording": "Annuler",
    "send_voice": "Envoyer",
    "voice_call_limit": "Appels vocaux désactivés pour les salons de plus de 7 utilisateurs.",
    "invalid_media_url": "Collez une URL YouTube ou SoundCloud après /media",
    "tic_tac_toe_one_person": "Morpion ne peut être envoyé qu'à une personne.",
    "chess_one_person": "Les échecs ne peuvent être envoyés qu'à une personne.",
    "rps_one_person": "Pierre-Feuille-Ciseaux ne peut être envoyé qu'à une personne."
  },
  "message": {
    "opened_view_once_photo": "Photo vue une fois ouverte",
    "opened_view_once_audio": "Audio vu une fois ouvert",
    "you_sent_photo": "Vous avez envoyé une photo",
    "view_once": "(Vue unique)",
    "edited": "modifié",
    "reply": "Répondre",
    "react": "Réagir",
    "edit": "Modifier",
    "delete": "Supprimer",
    "download": "Télécharger",
    "copy": "Copier",
    "decryption_failed": "⚠️ Déchiffrement échoué",
    "expired": "expiré",
    "vanishing": "disparaît"
  },
  "thread": {
    "reply_one": "{{count}} réponse",
    "reply_other": "{{count}} réponses",
    "reply_to_thread": "+ Répondre au fil",
    "collapse": "Réduire"
  },
  "reactions": {
    "add": "Ajouter une réaction"
  },
  "poll": {
    "vote": "Voter",
    "results": "Résultats",
    "votes_count": "{{count}} vote",
    "votes_count_plural": "{{count}} votes"
  },
  "game": {
    "challenge_sent": "Défi envoyé !",
    "your_turn": "Votre tour",
    "waiting": "En attente de l'adversaire...",
    "you_win": "Vous gagnez ! 🎉",
    "you_lose": "Vous perdez",
    "draw": "Égalité !",
    "rematch": "Revanche",
    "share": "Partager le résultat"
  },
  "modal": {
    "close": "Fermer",
    "cancel": "Annuler",
    "confirm": "Confirmer",
    "save": "Enregistrer",
    "done": "Terminé",
    "back": "Retour",
    "next": "Suivant",
    "loading": "Chargement..."
  },
  "room": {
    "leave": "Quitter",
    "users": "Utilisateurs",
    "topic": "Sujet",
    "host": "Hôte",
    "you": "Vous",
    "connected": "Connecté",
    "reconnecting": "Reconnexion...",
    "disconnected": "Déconnecté"
  },
  "language": {
    "select": "Langue",
    "en": "English",
    "fr": "Français",
    "es": "Español"
  }
}
```

---

### Task B5: Create Spanish translation file

**Files:**
- Create: `client/src/locales/es/translation.json`

- [ ] **Step 1: Write the file**

```json
{
  "app": {
    "name": "Ephemeral Chat",
    "tagline": "Conversaciones privadas y temporales"
  },
  "home": {
    "join": "Unirse",
    "joining": "Uniéndose...",
    "join_room": "Unirse a la sala",
    "join_with_code": "Unirse con código",
    "verbal_code": "Código verbal",
    "verbal_code_placeholder": "cuatro palabras aquí",
    "room_code_placeholder": "Código de sala",
    "create_room": "Crear sala",
    "create_drop": "Crear Drop",
    "claim_drop": "Reclamar Drop",
    "trace": "Rastrear",
    "invalid_room_code": "Ingrese un código de sala válido de 10 caracteres",
    "room_not_found": "Sala no encontrada. Verifique el código.",
    "failed_to_check_room": "Error al verificar la sala. Inténtelo de nuevo.",
    "invalid_verbal_code": "Código verbal no válido o expirado.",
    "invalid_verbal_format": "Ingrese 4 palabras separadas por espacios",
    "please_enter_verbal": "Ingrese un código verbal",
    "features": {
      "realtime": "Chat en tiempo real",
      "realtime_desc": "Mensajería instantánea",
      "websocket": "Impulsado por WebSocket",
      "websocket_desc": "Conexiones de baja latencia",
      "no_account": "Sin cuenta",
      "no_account_desc": "Sin registro necesario",
      "nickname": "Apodo",
      "nickname_desc": "Elige un nombre",
      "ephemeral": "Efímero",
      "ephemeral_desc": "Mensajes que se borran solos",
      "private": "Privado",
      "private_desc": "Contraseñas opcionales"
    }
  },
  "chat": {
    "no_messages": "Sin mensajes aún",
    "start_conversation": "¡Comienza la conversación!",
    "typing_one": "{{name}} está escribiendo...",
    "typing_many": "{{names}} están escribiendo...",
    "replying_to": "Respondiendo a {{name}}",
    "image_label": "Imagen",
    "voice_note_label": "Nota de voz",
    "file_label": "Archivo",
    "game_label": "Juego: {{type}}",
    "poll_label": "Encuesta",
    "sending_to": "Enviando a {{count}} usuario",
    "sending_to_plural": "Enviando a {{count}} usuarios",
    "clear_selection": "Limpiar selección",
    "private_tag": "Privado",
    "message_placeholder": "Mensaje...",
    "send": "Enviar",
    "encryption_failed": "Error de cifrado. Vuelve a unirte a la sala.",
    "file_encryption_failed": "Error al cifrar el archivo.",
    "audio_encryption_failed": "Error al cifrar el audio.",
    "failed_to_send": "Error al enviar el mensaje",
    "only_txt_files": "Solo se admiten archivos .txt",
    "admin_required": "Se requiere permiso de administrador para {{cmd}}",
    "recording_limit": "0:30",
    "stop_recording": "Detener",
    "cancel_recording": "Cancelar",
    "send_voice": "Enviar",
    "voice_call_limit": "Las llamadas de voz están desactivadas en salas con más de 7 usuarios.",
    "invalid_media_url": "Pega una URL de YouTube o SoundCloud después de /media",
    "tic_tac_toe_one_person": "Tres en raya solo se puede enviar a una persona.",
    "chess_one_person": "El ajedrez solo se puede enviar a una persona.",
    "rps_one_person": "Piedra-Papel-Tijera solo se puede enviar a una persona."
  },
  "message": {
    "opened_view_once_photo": "Foto de una sola vista abierta",
    "opened_view_once_audio": "Audio de una sola vista abierto",
    "you_sent_photo": "Enviaste una foto",
    "view_once": "(Ver una vez)",
    "edited": "editado",
    "reply": "Responder",
    "react": "Reaccionar",
    "edit": "Editar",
    "delete": "Eliminar",
    "download": "Descargar",
    "copy": "Copiar",
    "decryption_failed": "⚠️ Error de descifrado",
    "expired": "expirado",
    "vanishing": "desapareciendo"
  },
  "thread": {
    "reply_one": "{{count}} respuesta",
    "reply_other": "{{count}} respuestas",
    "reply_to_thread": "+ Responder al hilo",
    "collapse": "Contraer"
  },
  "reactions": {
    "add": "Añadir reacción"
  },
  "poll": {
    "vote": "Votar",
    "results": "Resultados",
    "votes_count": "{{count}} voto",
    "votes_count_plural": "{{count}} votos"
  },
  "game": {
    "challenge_sent": "¡Desafío enviado!",
    "your_turn": "Tu turno",
    "waiting": "Esperando al oponente...",
    "you_win": "¡Ganas! 🎉",
    "you_lose": "Pierdes",
    "draw": "¡Empate!",
    "rematch": "Revancha",
    "share": "Compartir resultado"
  },
  "modal": {
    "close": "Cerrar",
    "cancel": "Cancelar",
    "confirm": "Confirmar",
    "save": "Guardar",
    "done": "Hecho",
    "back": "Atrás",
    "next": "Siguiente",
    "loading": "Cargando..."
  },
  "room": {
    "leave": "Salir",
    "users": "Usuarios",
    "topic": "Tema",
    "host": "Anfitrión",
    "you": "Tú",
    "connected": "Conectado",
    "reconnecting": "Reconectando...",
    "disconnected": "Desconectado"
  },
  "language": {
    "select": "Idioma",
    "en": "English",
    "fr": "Français",
    "es": "Español"
  }
}
```

---

### Task B6: Wire i18n into the app entry point

**Files:**
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Read main.jsx to see current content**

Open `client/src/main.jsx`. It will look roughly like:
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
```

- [ ] **Step 2: Add i18n import before App**

Add `import './i18n';` as the second import (after React, before App):
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n';
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
```

- [ ] **Step 3: Commit**
```bash
git add client/src/i18n.js client/src/main.jsx client/src/locales/
git commit -m "feat: set up i18next with EN/FR/ES translation files"
```

---

### Task B7: Create LanguageSwitcher component

**Files:**
- Create: `client/src/components/LanguageSwitcher.jsx`

- [ ] **Step 1: Write the component**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' }
];

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language || 'en';

  const handleChange = (code) => {
    i18n.changeLanguage(code);
  };

  return (
    <div className="relative flex items-center" title={t('language.select')}>
      <Languages className="w-4 h-4 text-gray-400 mr-1" />
      <select
        value={current.split('-')[0]}
        onChange={(e) => handleChange(e.target.value)}
        className="appearance-none bg-transparent text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer focus:outline-none pr-1"
        aria-label={t('language.select')}
      >
        {LANGS.map(l => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
```

---

### Task B8: Mount LanguageSwitcher in Home header

**Files:**
- Modify: `client/src/components/Home.jsx`

- [ ] **Step 1: Add import**

At the top of Home.jsx, add:
```js
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
```

- [ ] **Step 2: Add useTranslation hook inside the component**

After the existing `useState` declarations, add:
```js
const { t } = useTranslation();
```

- [ ] **Step 3: Mount LanguageSwitcher in the header**

In the header section, find the `<div className="flex items-center space-x-2">` that contains `<RefreshButton />` and `<ThemeToggle />`. Add `<LanguageSwitcher />` before `<ThemeToggle />`:

```jsx
<div className="flex items-center space-x-2">
  <RefreshButton />
  <LanguageSwitcher />
  <ThemeToggle />
</div>
```

- [ ] **Step 4: Replace hardcoded strings with t() calls**

Replace all user-facing string literals in the JSX. Key replacements in Home.jsx:

```jsx
// "Ephemeral Chat" heading
{t('app.name')}

// Feature grid items  
title: t('home.features.realtime'), description: t('home.features.realtime_desc')
title: t('home.features.websocket'), description: t('home.features.websocket_desc')
title: t('home.features.no_account'), description: t('home.features.no_account_desc')
title: t('home.features.nickname'), description: t('home.features.nickname_desc')
title: t('home.features.ephemeral'), description: t('home.features.ephemeral_desc')
title: t('home.features.private'), description: t('home.features.private_desc')

// Buttons
{isJoining ? t('home.joining') : t('home.join')}
{t('home.create_room')}

// Placeholders
placeholder={t('home.room_code_placeholder')}
placeholder={t('home.verbal_code_placeholder')}

// Errors (in JS logic, replace alert strings):
alert(t('home.invalid_room_code'))
alert(t('home.room_not_found'))
alert(t('home.failed_to_check_room'))
setVerbalError(t('home.invalid_verbal_code'))
setVerbalError(t('home.invalid_verbal_format'))
setVerbalError(t('home.please_enter_verbal'))
```

- [ ] **Step 5: Commit**
```bash
git add client/src/components/Home.jsx client/src/components/LanguageSwitcher.jsx
git commit -m "feat: add i18n to Home page and LanguageSwitcher component"
```

---

### Task B9: Add i18n to ThreadView

**Files:**
- Modify: `client/src/components/ThreadView.jsx`

- [ ] **Step 1: Update the file**

The current file is 62 lines. Replace with i18n-aware version:

```jsx
import React, { useState, useMemo } from 'react';
import { X, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ThreadView = ({ parentMessage, allMessages, onReply, onClose }) => {
    const { t } = useTranslation();

    const threadMessages = useMemo(() => {
        if (!parentMessage?.id) return [];
        return allMessages.filter(m => m.replyTo?.id === parentMessage.id)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }, [parentMessage?.id, allMessages]);

    const formatTime = (ts) => {
        const date = new Date(ts);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (threadMessages.length === 0) return null;

    return (
        <div className="mt-2 ml-4 border-l-2 border-purple-300 dark:border-purple-700 pl-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                    <MessageSquare className="w-3 h-3" />
                    <span>
                        {t('thread.reply_one', { count: threadMessages.length, defaultValue: `${threadMessages.length} ${threadMessages.length === 1 ? 'reply' : 'replies'}` })}
                    </span>
                </div>
                <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label={t('thread.collapse')}>
                    <X className="w-3 h-3 text-gray-400" />
                </button>
            </div>

            {threadMessages.map((msg) => (
                <div key={msg.id} className="flex flex-col space-y-0.5">
                    <div className="flex items-center space-x-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                        <span className={`font-bold ${msg.isAnonymous ? 'text-purple-500' : 'text-primary-500 dark:text-primary-400'}`}>
                            {msg.sender.nickname}
                        </span>
                        <span>•</span>
                        <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    <div className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-2.5 py-1.5">
                        {msg.messageType === 'image' ? `📷 ${t('chat.image_label')}` :
                            msg.messageType === 'audio' ? `🎤 ${t('chat.voice_note_label')}` :
                                msg.content}
                    </div>
                </div>
            ))}

            <button
                onClick={() => onReply(parentMessage)}
                className="text-[10px] font-bold text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors py-1"
            >
                {t('thread.reply_to_thread')}
            </button>
        </div>
    );
};

export default ThreadView;
```

- [ ] **Step 2: Commit**
```bash
git add client/src/components/ThreadView.jsx
git commit -m "feat: add i18n to ThreadView component"
```

---

### Task B10: Add i18n to MessageList

**Files:**
- Modify: `client/src/components/MessageList.jsx`

- [ ] **Step 1: Add useTranslation import**

Add to the existing import block at line 1:
```js
import { useTranslation } from 'react-i18next';
```

- [ ] **Step 2: Add hook inside MessageList component**

After `const { theme } = useTheme();` add:
```js
const { t } = useTranslation();
```

- [ ] **Step 3: Replace hardcoded strings**

Find and replace each of the following:

**Empty state (around line 278):**
```jsx
// BEFORE:
<p className="text-lg font-medium mb-1">No messages yet</p>
<p className="text-sm opacity-60">Start the conversation!</p>

// AFTER:
<p className="text-lg font-medium mb-1">{t('chat.no_messages')}</p>
<p className="text-sm opacity-60">{t('chat.start_conversation')}</p>
```

**View-once opened label (around line 319):**
```jsx
// BEFORE:
<span>Opened view-once {isImage ? 'photo' : 'audio'}</span>

// AFTER:
<span>{isImage ? t('message.opened_view_once_photo') : t('message.opened_view_once_audio')}</span>
```

**Private tag (around line 350):**
```jsx
// BEFORE:
<span className="...">Private</span>

// AFTER:
<span className="...">{t('chat.private_tag')}</span>
```

**"You sent a photo" (around line 398):**
```jsx
// BEFORE:
<span className="...">You sent a photo</span>
{isViewOnce && <span ...>(View Once)</span>}

// AFTER:
<span className="...">{t('message.you_sent_photo')}</span>
{isViewOnce && <span ...>{t('message.view_once')}</span>}
```

**Hover action button titles:**
```jsx
// Reply button title:
title={t('message.reply')}

// Edit button title:
title={t('message.edit')}

// Delete button title:
title={t('message.delete')}
```

**Thread count button (around line 606):**
```jsx
// BEFORE:
<span>{isExpanded ? '▾' : '▸'} {replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>

// AFTER:
<span>
  {isExpanded ? '▾' : '▸'}{' '}
  {t(replyCount === 1 ? 'thread.reply_one' : 'thread.reply_other', { count: replyCount })}
</span>
```

- [ ] **Step 4: Commit**
```bash
git add client/src/components/MessageList.jsx
git commit -m "feat: add i18n to MessageList component"
```

---

### Task B11: Add i18n to ChatRoom (key UI strings)

**Files:**
- Modify: `client/src/components/ChatRoom.jsx`

- [ ] **Step 1: Add import**

Add to the imports at the top:
```js
import { useTranslation } from 'react-i18next';
```

- [ ] **Step 2: Add hook near the top of the ChatRoom component**

After the existing `useTheme()` call, add:
```js
const { t } = useTranslation();
```

- [ ] **Step 3: Replace key strings**

**Typing indicator (around line 2972):**
```jsx
// BEFORE:
{Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...

// AFTER:
{typingUsers.size === 1
  ? t('chat.typing_one', { name: Array.from(typingUsers.values())[0] })
  : t('chat.typing_many', { names: Array.from(typingUsers.values()).join(', ') })}
```

**Replying to banner (around line 2982):**
```jsx
// BEFORE:
<span className={...}>Replying to {replyingTo.sender.nickname}</span>
{replyingTo.messageType === 'image' ? 'Image' : replyingTo.messageType === 'audio' ? 'Voice Note' : replyingTo.content}

// AFTER:
<span className={...}>{t('chat.replying_to', { name: replyingTo.sender.nickname })}</span>
{replyingTo.messageType === 'image' ? t('chat.image_label')
  : replyingTo.messageType === 'audio' ? t('chat.voice_note_label')
  : replyingTo.content}
```

**Sending to N users banner (around line 2995):**
```jsx
// BEFORE:
Sending to {selectedRecipients.length} specific user{selectedRecipients.length !== 1 ? 's' : ''}

// AFTER:
{t(selectedRecipients.length === 1 ? 'chat.sending_to' : 'chat.sending_to_plural', { count: selectedRecipients.length })}
```

**Clear selection (around line 2996):**
```jsx
// BEFORE:
Clear selection

// AFTER:
{t('chat.clear_selection')}
```

**Error strings inside doSendMessage — replace the string literals:**
```js
setError(t('chat.encryption_failed'));       // line ~2032
setError(t('chat.file_encryption_failed'));  // line ~2440
setError(t('chat.audio_encryption_failed')); // line ~2659
setError(t('chat.failed_to_send'));          // line ~2073
setError(t('chat.only_txt_files'));          // line ~1880
setError(t('chat.tic_tac_toe_one_person'));  // line ~1918
setError(t('chat.chess_one_person'));        // line ~1922
setError(t('chat.rps_one_person'));          // line ~1928
setError(t('chat.voice_call_limit'));        // line ~1937
setError(t('chat.invalid_media_url'));       // line ~1974
```

**Admin error (pass the cmd):**
```js
setError(t('chat.admin_required', { cmd }));
```

- [ ] **Step 4: Commit**
```bash
git add client/src/components/ChatRoom.jsx
git commit -m "feat: add i18n to ChatRoom UI strings and error messages"
```

---

### Task B12: Final verification

- [ ] **Step 1: Build the client**
```bash
cd client && npm run build
```
Expected: build completes with no errors.

- [ ] **Step 2: Run dev server and manually test language switch**
```bash
cd client && npm run dev
```
- Open app, switch language to FR via the switcher in header
- Verify Home page text changes to French
- Join a room, verify chat UI strings are French
- Reload — language should persist (stored in localStorage)

- [ ] **Step 3: Verify thread count in replies**
- Send a message, swipe-reply to it, verify thread count shows correctly
- Verify game/file/poll reply types show human-readable labels

- [ ] **Step 4: Final commit**
```bash
git add .
git commit -m "feat: complete i18n implementation with EN/FR/ES and reply polish"
```

---

## Self-Review

**Spec coverage:**
- [x] Reply content builder handles game, file, poll types → Task A1
- [x] Image/file send path includes replyTo → Task A2
- [x] Audio send path includes replyTo → Task A3
- [x] i18next installed → Task B1
- [x] i18n.js init file → Task B2
- [x] EN/FR/ES translation files → Tasks B3–B5
- [x] App entry point wires i18n → Task B6
- [x] LanguageSwitcher component → Task B7
- [x] Home.jsx translated → Task B8
- [x] ThreadView.jsx translated → Task B9
- [x] MessageList.jsx translated → Task B10
- [x] ChatRoom.jsx key strings translated → Task B11
- [x] Verification + build check → Task B12

**Placeholder scan:** No TBDs or "implement later" present. All code blocks are complete.

**Type consistency:** `t()` is called consistently. Translation key names match exactly between JSON files and component usage.
