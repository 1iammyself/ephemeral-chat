const TRANSLATIONS = {
  en: {
    meta: { title: 'Ephchat - Secure Ephemeral Messaging' },
    hero: {
      badge: '🔒 Privacy First',
      title: 'Chat Without a Trace',
      subtitle: 'Ephemeral messaging with privacy. No history',
      downloadAndroid: 'Download for Android',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'Privacy by Design',
      subtitle: 'Every feature is built to protect your conversations',
      ephemeral: { title: 'Truly Ephemeral', desc: 'Messages disappear when you leave the room. No message history, no data retention.' },
      screenshot: { title: 'Screenshot Protection', desc: 'Blocks screenshots and screen recording. Your conversations stay private.' },
      anonymous: { title: 'Anonymous by Default', desc: 'No accounts, no emails, no phone numbers. Just pick a nickname and start chatting.' },
      encrypted: { title: 'End-to-End Encrypted', desc: 'Communication is encrypted in transit.' },
      voice: { title: 'Voice Calls', desc: 'High-quality WebRTC peer-to-peer calls' },
      fileShare: { title: 'E2ECP File Sharing', desc: 'Send photos, videos, and documents with confidence. Files are never stored on our servers.' },
    },
    howItWorks: {
      title: 'How It Works',
      subtitle: 'Get started in seconds',
      step1: { title: 'Create a Room', desc: 'Generate a unique room code or use a custom phrase' },
      step2: { title: 'Share the Code', desc: 'Send the room code to your friends via any channel' },
      step3: { title: 'Start Chatting', desc: 'Messages totally disappear' },
    },
    download: {
      title: 'Download Ephchat',
      subtitle: 'Available on all your devices',
      android: { title: 'Android', desc: 'APK for Android 8.0+', btn: 'Download APK' },
      windows: { title: 'Windows', desc: 'Installer for Windows', btn: 'Download .exe' },
      macos: { title: 'macOS', desc: 'DMG for macOS', btn: 'Download .dmg' },
      linux: { title: 'Linux', desc: 'AppImage for Linux', btn: 'Download AppImage' },
    },
    faq: {
      title: 'Frequently Asked Questions',
      q1: { question: 'How does screenshot protection work?', answer: 'The Android and Desktop apps use platform-specific APIs to block screenshot capture and screen recording while the app is active.' },
      q2: { question: 'Where are messages stored?', answer: 'Messages are never stored on our servers. They exist only on your device while the chat is open and disappear instantly.' },
      q3: { question: 'Is it end-to-end encrypted?', answer: 'Yes. All communication is end-to-end encrypted using industry-standard protocols. Your messages and calls are private and secure.' },
    },
    footer: {
      product: 'Product',
      downloads: 'Downloads',
      privacy: 'Privacy Policy',
      resources: 'Resources',
      docs: 'Documentation',
      contact: 'Contact',
      copyright: '© 2026 Ephchat',
    },
  },

  ar: {
    meta: { title: 'Ephchat - مراسلة مؤقتة آمنة' },
    hero: {
      badge: '🔒 الخصوصية أولاً',
      title: 'تحدث دون أن تترك أثراً',
      subtitle: 'مراسلة مؤقتة مع حماية الخصوصية. لا سجل',
      downloadAndroid: 'تحميل لأندرويد',
      windows: 'ويندوز',
      macos: 'ماك أو إس',
      linux: 'لينكس',
    },
    features: {
      title: 'الخصوصية بالتصميم',
      subtitle: 'كل ميزة مبنية لحماية محادثاتك',
      ephemeral: { title: 'مؤقت حقاً', desc: 'تختفي الرسائل عند مغادرة الغرفة. لا سجل رسائل، لا احتفاظ بالبيانات.' },
      screenshot: { title: 'حماية لقطة الشاشة', desc: 'يحظر التقاط الشاشة وتسجيلها. محادثاتك تبقى خاصة.' },
      anonymous: { title: 'مجهول بشكل افتراضي', desc: 'لا حسابات، لا بريد إلكتروني، لا أرقام هاتف. فقط اختر اسماً مستعاراً وابدأ المحادثة.' },
      encrypted: { title: 'مشفر من طرف إلى طرف', desc: 'التواصل مشفر أثناء النقل.' },
      voice: { title: 'مكالمات صوتية', desc: 'مكالمات WebRTC نظير إلى نظير عالية الجودة' },
      fileShare: { title: 'مشاركة ملفات E2ECP', desc: 'أرسل الصور والمقاطع والمستندات بثقة. لا يتم تخزين الملفات على خوادمنا.' },
    },
    howItWorks: {
      title: 'كيف يعمل',
      subtitle: 'ابدأ في ثوانٍ',
      step1: { title: 'أنشئ غرفة', desc: 'أنشئ رمز غرفة فريد أو استخدم عبارة مخصصة' },
      step2: { title: 'شارك الرمز', desc: 'أرسل رمز الغرفة لأصدقائك عبر أي قناة' },
      step3: { title: 'ابدأ المحادثة', desc: 'تختفي الرسائل تماماً' },
    },
    download: {
      title: 'تحميل Ephchat',
      subtitle: 'متاح على جميع أجهزتك',
      android: { title: 'أندرويد', desc: 'APK لأندرويد 8.0+', btn: 'تحميل APK' },
      windows: { title: 'ويندوز', desc: 'مثبت لويندوز', btn: 'تحميل .exe' },
      macos: { title: 'ماك أو إس', desc: 'DMG لماك أو إس', btn: 'تحميل .dmg' },
      linux: { title: 'لينكس', desc: 'AppImage لأنظمة لينكس', btn: 'تحميل AppImage' },
    },
    faq: {
      title: 'الأسئلة الشائعة',
      q1: { question: 'كيف تعمل حماية لقطة الشاشة؟', answer: 'تستخدم تطبيقات أندرويد وسطح المكتب واجهات برمجية خاصة بالمنصة لحظر التقاط الشاشة وتسجيلها أثناء نشاط التطبيق.' },
      q2: { question: 'أين تُخزَّن الرسائل؟', answer: 'لا تُخزَّن الرسائل أبداً على خوادمنا. توجد فقط على جهازك أثناء فتح المحادثة وتختفي فوراً.' },
      q3: { question: 'هل التشفير من طرف إلى طرف؟', answer: 'نعم. جميع الاتصالات مشفرة من طرف إلى طرف باستخدام بروتوكولات قياسية. رسائلك ومكالماتك خاصة وآمنة.' },
    },
    footer: {
      product: 'المنتج',
      downloads: 'التحميلات',
      privacy: 'سياسة الخصوصية',
      resources: 'الموارد',
      docs: 'التوثيق',
      contact: 'اتصل بنا',
      copyright: '© 2026 Ephchat',
    },
  },

  de: {
    meta: { title: 'Ephchat - Sicheres ephemeres Messaging' },
    hero: {
      badge: '🔒 Datenschutz zuerst',
      title: 'Chatten ohne Spuren',
      subtitle: 'Ephemeres Messaging mit Datenschutz. Kein Verlauf',
      downloadAndroid: 'Für Android herunterladen',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'Datenschutz durch Design',
      subtitle: 'Jede Funktion schützt Ihre Unterhaltungen',
      ephemeral: { title: 'Wirklich flüchtig', desc: 'Nachrichten verschwinden, wenn Sie den Raum verlassen. Kein Verlauf, keine Datenspeicherung.' },
      screenshot: { title: 'Screenshot-Schutz', desc: 'Blockiert Screenshots und Bildschirmaufnahmen. Ihre Gespräche bleiben privat.' },
      anonymous: { title: 'Standardmäßig anonym', desc: 'Keine Konten, keine E-Mails, keine Telefonnummern. Wählen Sie einen Spitznamen und starten Sie.' },
      encrypted: { title: 'Ende-zu-Ende verschlüsselt', desc: 'Kommunikation wird während der Übertragung verschlüsselt.' },
      voice: { title: 'Sprachanrufe', desc: 'Hochwertige WebRTC-Peer-to-Peer-Anrufe' },
      fileShare: { title: 'E2ECP-Dateifreigabe', desc: 'Senden Sie Fotos, Videos und Dokumente sicher. Dateien werden nie auf unseren Servern gespeichert.' },
    },
    howItWorks: {
      title: 'Wie es funktioniert',
      subtitle: 'In Sekunden loslegen',
      step1: { title: 'Raum erstellen', desc: 'Generieren Sie einen einzigartigen Raumcode oder verwenden Sie einen benutzerdefinierten Ausdruck' },
      step2: { title: 'Code teilen', desc: 'Senden Sie den Raumcode über einen beliebigen Kanal an Ihre Freunde' },
      step3: { title: 'Chatten beginnen', desc: 'Nachrichten verschwinden vollständig' },
    },
    download: {
      title: 'Ephchat herunterladen',
      subtitle: 'Verfügbar auf all Ihren Geräten',
      android: { title: 'Android', desc: 'APK für Android 8.0+', btn: 'APK herunterladen' },
      windows: { title: 'Windows', desc: 'Installer für Windows', btn: '.exe herunterladen' },
      macos: { title: 'macOS', desc: 'DMG für macOS', btn: '.dmg herunterladen' },
      linux: { title: 'Linux', desc: 'AppImage für Linux', btn: 'AppImage herunterladen' },
    },
    faq: {
      title: 'Häufig gestellte Fragen',
      q1: { question: 'Wie funktioniert der Screenshot-Schutz?', answer: 'Die Android- und Desktop-Apps verwenden plattformspezifische APIs, um Screenshots und Bildschirmaufnahmen zu blockieren.' },
      q2: { question: 'Wo werden Nachrichten gespeichert?', answer: 'Nachrichten werden nie auf unseren Servern gespeichert. Sie existieren nur auf Ihrem Gerät, während der Chat geöffnet ist.' },
      q3: { question: 'Ist es Ende-zu-Ende verschlüsselt?', answer: 'Ja. Alle Kommunikation ist Ende-zu-Ende-verschlüsselt mit Industriestandard-Protokollen. Ihre Nachrichten und Anrufe sind privat und sicher.' },
    },
    footer: {
      product: 'Produkt',
      downloads: 'Downloads',
      privacy: 'Datenschutzrichtlinie',
      resources: 'Ressourcen',
      docs: 'Dokumentation',
      contact: 'Kontakt',
      copyright: '© 2026 Ephchat',
    },
  },

  es: {
    meta: { title: 'Ephchat - Mensajería efímera segura' },
    hero: {
      badge: '🔒 Privacidad primero',
      title: 'Chatea sin dejar rastro',
      subtitle: 'Mensajería efímera con privacidad. Sin historial',
      downloadAndroid: 'Descargar para Android',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'Privacidad por diseño',
      subtitle: 'Cada función está construida para proteger tus conversaciones',
      ephemeral: { title: 'Verdaderamente efímero', desc: 'Los mensajes desaparecen cuando sales de la sala. Sin historial, sin retención de datos.' },
      screenshot: { title: 'Protección de capturas', desc: 'Bloquea capturas de pantalla y grabación. Tus conversaciones permanecen privadas.' },
      anonymous: { title: 'Anónimo por defecto', desc: 'Sin cuentas, sin correos, sin teléfonos. Solo elige un apodo y comienza.' },
      encrypted: { title: 'Cifrado de extremo a extremo', desc: 'La comunicación está cifrada en tránsito.' },
      voice: { title: 'Llamadas de voz', desc: 'Llamadas WebRTC peer-to-peer de alta calidad' },
      fileShare: { title: 'Compartir archivos E2ECP', desc: 'Envía fotos, videos y documentos con confianza. Los archivos nunca se almacenan en nuestros servidores.' },
    },
    howItWorks: {
      title: 'Cómo funciona',
      subtitle: 'Comienza en segundos',
      step1: { title: 'Crea una sala', desc: 'Genera un código de sala único o usa una frase personalizada' },
      step2: { title: 'Comparte el código', desc: 'Envía el código de sala a tus amigos por cualquier canal' },
      step3: { title: 'Empieza a chatear', desc: 'Los mensajes desaparecen por completo' },
    },
    download: {
      title: 'Descargar Ephchat',
      subtitle: 'Disponible en todos tus dispositivos',
      android: { title: 'Android', desc: 'APK para Android 8.0+', btn: 'Descargar APK' },
      windows: { title: 'Windows', desc: 'Instalador para Windows', btn: 'Descargar .exe' },
      macos: { title: 'macOS', desc: 'DMG para macOS', btn: 'Descargar .dmg' },
      linux: { title: 'Linux', desc: 'AppImage para Linux', btn: 'Descargar AppImage' },
    },
    faq: {
      title: 'Preguntas frecuentes',
      q1: { question: '¿Cómo funciona la protección de capturas?', answer: 'Las apps de Android y escritorio usan APIs específicas de la plataforma para bloquear capturas de pantalla y grabaciones.' },
      q2: { question: '¿Dónde se almacenan los mensajes?', answer: 'Los mensajes nunca se almacenan en nuestros servidores. Existen solo en tu dispositivo mientras el chat está abierto.' },
      q3: { question: '¿Está cifrado de extremo a extremo?', answer: 'Sí. Toda la comunicación está cifrada de extremo a extremo usando protocolos estándar de la industria. Tus mensajes y llamadas son privados y seguros.' },
    },
    footer: {
      product: 'Producto',
      downloads: 'Descargas',
      privacy: 'Política de privacidad',
      resources: 'Recursos',
      docs: 'Documentación',
      contact: 'Contacto',
      copyright: '© 2026 Ephchat',
    },
  },

  fr: {
    meta: { title: 'Ephchat - Messagerie éphémère sécurisée' },
    hero: {
      badge: '🔒 La vie privée d\'abord',
      title: 'Chattez sans laisser de trace',
      subtitle: 'Messagerie éphémère avec confidentialité. Sans historique',
      downloadAndroid: 'Télécharger pour Android',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'Confidentialité par conception',
      subtitle: 'Chaque fonctionnalité est conçue pour protéger vos conversations',
      ephemeral: { title: 'Vraiment éphémère', desc: 'Les messages disparaissent lorsque vous quittez la salle. Aucun historique, aucune rétention de données.' },
      screenshot: { title: 'Protection des captures d\'écran', desc: 'Bloque les captures d\'écran et l\'enregistrement. Vos conversations restent privées.' },
      anonymous: { title: 'Anonyme par défaut', desc: 'Pas de comptes, pas d\'e-mails, pas de numéros de téléphone. Choisissez un pseudonyme et commencez.' },
      encrypted: { title: 'Chiffrement de bout en bout', desc: 'La communication est chiffrée en transit.' },
      voice: { title: 'Appels vocaux', desc: 'Appels WebRTC pair-à-pair de haute qualité' },
      fileShare: { title: 'Partage de fichiers E2ECP', desc: 'Envoyez des photos, vidéos et documents en toute confiance. Les fichiers ne sont jamais stockés sur nos serveurs.' },
    },
    howItWorks: {
      title: 'Comment ça marche',
      subtitle: 'Commencez en quelques secondes',
      step1: { title: 'Créer une salle', desc: 'Générez un code de salle unique ou utilisez une phrase personnalisée' },
      step2: { title: 'Partager le code', desc: 'Envoyez le code de salle à vos amis via n\'importe quel canal' },
      step3: { title: 'Commencer à chatter', desc: 'Les messages disparaissent totalement' },
    },
    download: {
      title: 'Télécharger Ephchat',
      subtitle: 'Disponible sur tous vos appareils',
      android: { title: 'Android', desc: 'APK pour Android 8.0+', btn: 'Télécharger APK' },
      windows: { title: 'Windows', desc: 'Installateur pour Windows', btn: 'Télécharger .exe' },
      macos: { title: 'macOS', desc: 'DMG pour macOS', btn: 'Télécharger .dmg' },
      linux: { title: 'Linux', desc: 'AppImage pour Linux', btn: 'Télécharger AppImage' },
    },
    faq: {
      title: 'Foire aux questions',
      q1: { question: 'Comment fonctionne la protection des captures d\'écran ?', answer: 'Les applications Android et Bureau utilisent des API spécifiques à la plateforme pour bloquer les captures d\'écran et l\'enregistrement d\'écran.' },
      q2: { question: 'Où sont stockés les messages ?', answer: 'Les messages ne sont jamais stockés sur nos serveurs. Ils n\'existent que sur votre appareil pendant que le chat est ouvert.' },
      q3: { question: 'Est-ce chiffré de bout en bout ?', answer: 'Oui. Toutes les communications sont chiffrées de bout en bout avec des protocoles standard de l\'industrie. Vos messages et appels sont privés et sécurisés.' },
    },
    footer: {
      product: 'Produit',
      downloads: 'Téléchargements',
      privacy: 'Politique de confidentialité',
      resources: 'Ressources',
      docs: 'Documentation',
      contact: 'Contact',
      copyright: '© 2026 Ephchat',
    },
  },

  hi: {
    meta: { title: 'Ephchat - सुरक्षित अस्थायी संदेश' },
    hero: {
      badge: '🔒 गोपनीयता पहले',
      title: 'बिना निशान छोड़े चैट करें',
      subtitle: 'गोपनीयता के साथ अस्थायी संदेश। कोई इतिहास नहीं',
      downloadAndroid: 'Android के लिए डाउनलोड करें',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'डिज़ाइन से गोपनीयता',
      subtitle: 'हर सुविधा आपकी बातचीत की सुरक्षा के लिए बनाई गई है',
      ephemeral: { title: 'सच में अस्थायी', desc: 'कमरा छोड़ने पर संदेश गायब हो जाते हैं। कोई संदेश इतिहास नहीं, कोई डेटा संग्रहण नहीं।' },
      screenshot: { title: 'स्क्रीनशॉट सुरक्षा', desc: 'स्क्रीनशॉट और स्क्रीन रिकॉर्डिंग ब्लॉक करता है। आपकी बातचीत निजी रहती है।' },
      anonymous: { title: 'डिफ़ॉल्ट रूप से गुमनाम', desc: 'कोई खाता नहीं, कोई ईमेल नहीं, कोई फ़ोन नंबर नहीं। बस एक उपनाम चुनें और चैट शुरू करें।' },
      encrypted: { title: 'एंड-टू-एंड एन्क्रिप्टेड', desc: 'ट्रांसमिशन के दौरान संचार एन्क्रिप्टेड है।' },
      voice: { title: 'वॉयस कॉल', desc: 'उच्च-गुणवत्ता WebRTC पीयर-टू-पीयर कॉल' },
      fileShare: { title: 'E2ECP फ़ाइल शेयरिंग', desc: 'फ़ोटो, वीडियो और दस्तावेज़ विश्वास के साथ भेजें। फ़ाइलें कभी हमारे सर्वर पर संग्रहीत नहीं होती।' },
    },
    howItWorks: {
      title: 'यह कैसे काम करता है',
      subtitle: 'सेकंडों में शुरू करें',
      step1: { title: 'एक कमरा बनाएं', desc: 'एक अद्वितीय कमरा कोड उत्पन्न करें या कस्टम वाक्यांश उपयोग करें' },
      step2: { title: 'कोड शेयर करें', desc: 'किसी भी चैनल के माध्यम से अपने दोस्तों को कमरा कोड भेजें' },
      step3: { title: 'चैट शुरू करें', desc: 'संदेश पूरी तरह गायब हो जाते हैं' },
    },
    download: {
      title: 'Ephchat डाउनलोड करें',
      subtitle: 'आपके सभी उपकरणों पर उपलब्ध',
      android: { title: 'Android', desc: 'Android 8.0+ के लिए APK', btn: 'APK डाउनलोड करें' },
      windows: { title: 'Windows', desc: 'Windows के लिए इंस्टॉलर', btn: '.exe डाउनलोड करें' },
      macos: { title: 'macOS', desc: 'macOS के लिए DMG', btn: '.dmg डाउनलोड करें' },
      linux: { title: 'Linux', desc: 'Linux के लिए AppImage', btn: 'AppImage डाउनलोड करें' },
    },
    faq: {
      title: 'अक्सर पूछे जाने वाले प्रश्न',
      q1: { question: 'स्क्रीनशॉट सुरक्षा कैसे काम करती है?', answer: 'Android और Desktop ऐप प्लेटफ़ॉर्म-विशिष्ट API का उपयोग करके स्क्रीनशॉट कैप्चर और स्क्रीन रिकॉर्डिंग को ब्लॉक करते हैं।' },
      q2: { question: 'संदेश कहाँ संग्रहीत होते हैं?', answer: 'संदेश कभी हमारे सर्वर पर संग्रहीत नहीं होते। वे केवल आपके डिवाइस पर तब तक रहते हैं जब चैट खुली हो।' },
      q3: { question: 'क्या यह एंड-टू-एंड एन्क्रिप्टेड है?', answer: 'हां। सभी संचार उद्योग-मानक प्रोटोकॉल का उपयोग करके एंड-टू-एंड एन्क्रिप्टेड है। आपके संदेश और कॉल निजी और सुरक्षित हैं।' },
    },
    footer: {
      product: 'उत्पाद',
      downloads: 'डाउनलोड',
      privacy: 'गोपनीयता नीति',
      resources: 'संसाधन',
      docs: 'दस्तावेज़ीकरण',
      contact: 'संपर्क',
      copyright: '© 2026 Ephchat',
    },
  },

  ja: {
    meta: { title: 'Ephchat - 安全な一時メッセージング' },
    hero: {
      badge: '🔒 プライバシー優先',
      title: '痕跡を残さずチャット',
      subtitle: 'プライバシーを守る一時的なメッセージ。履歴なし',
      downloadAndroid: 'Androidでダウンロード',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'プライバシー・バイ・デザイン',
      subtitle: 'すべての機能は会話を守るために設計されています',
      ephemeral: { title: '真に一時的', desc: '部屋を離れるとメッセージが消えます。メッセージ履歴なし、データ保持なし。' },
      screenshot: { title: 'スクリーンショット保護', desc: 'スクリーンショットと画面録画をブロック。会話は常にプライベート。' },
      anonymous: { title: 'デフォルトで匿名', desc: 'アカウント不要、メール不要、電話番号不要。ニックネームを選んでチャット開始。' },
      encrypted: { title: 'エンドツーエンド暗号化', desc: '通信は転送中に暗号化されます。' },
      voice: { title: '音声通話', desc: '高品質なWebRTCピアツーピア通話' },
      fileShare: { title: 'E2ECPファイル共有', desc: '写真、動画、文書を安心して送信。ファイルはサーバーに保存されません。' },
    },
    howItWorks: {
      title: '使い方',
      subtitle: '数秒で始められます',
      step1: { title: '部屋を作成', desc: 'ユニークな部屋コードを生成するか、カスタムフレーズを使用' },
      step2: { title: 'コードを共有', desc: '任意のチャンネルで友達に部屋コードを送信' },
      step3: { title: 'チャット開始', desc: 'メッセージは完全に消えます' },
    },
    download: {
      title: 'Ephchatをダウンロード',
      subtitle: 'すべてのデバイスで利用可能',
      android: { title: 'Android', desc: 'Android 8.0+向けAPK', btn: 'APKをダウンロード' },
      windows: { title: 'Windows', desc: 'Windows向けインストーラー', btn: '.exeをダウンロード' },
      macos: { title: 'macOS', desc: 'macOS向けDMG', btn: '.dmgをダウンロード' },
      linux: { title: 'Linux', desc: 'Linux向けAppImage', btn: 'AppImageをダウンロード' },
    },
    faq: {
      title: 'よくある質問',
      q1: { question: 'スクリーンショット保護はどのように機能しますか？', answer: 'AndroidとDesktopアプリは、プラットフォーム固有のAPIを使用してスクリーンショットと画面録画をブロックします。' },
      q2: { question: 'メッセージはどこに保存されますか？', answer: 'メッセージはサーバーに保存されません。チャットが開いている間のみデバイス上に存在し、すぐに消えます。' },
      q3: { question: 'エンドツーエンド暗号化されていますか？', answer: 'はい。すべての通信は業界標準のプロトコルを使用してエンドツーエンド暗号化されています。メッセージと通話はプライベートで安全です。' },
    },
    footer: {
      product: 'プロダクト',
      downloads: 'ダウンロード',
      privacy: 'プライバシーポリシー',
      resources: 'リソース',
      docs: 'ドキュメント',
      contact: 'お問い合わせ',
      copyright: '© 2026 Ephchat',
    },
  },

  pt: {
    meta: { title: 'Ephchat - Mensagens efêmeras seguras' },
    hero: {
      badge: '🔒 Privacidade primeiro',
      title: 'Converse sem deixar rastros',
      subtitle: 'Mensagens efêmeras com privacidade. Sem histórico',
      downloadAndroid: 'Baixar para Android',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'Privacidade por design',
      subtitle: 'Cada recurso é construído para proteger suas conversas',
      ephemeral: { title: 'Verdadeiramente efêmero', desc: 'Mensagens desaparecem quando você sai da sala. Sem histórico, sem retenção de dados.' },
      screenshot: { title: 'Proteção de capturas de tela', desc: 'Bloqueia capturas de tela e gravação. Suas conversas permanecem privadas.' },
      anonymous: { title: 'Anônimo por padrão', desc: 'Sem contas, sem e-mails, sem números de telefone. Escolha um apelido e comece.' },
      encrypted: { title: 'Criptografia de ponta a ponta', desc: 'A comunicação é criptografada em trânsito.' },
      voice: { title: 'Chamadas de voz', desc: 'Chamadas WebRTC ponto a ponto de alta qualidade' },
      fileShare: { title: 'Compartilhamento E2ECP', desc: 'Envie fotos, vídeos e documentos com confiança. Arquivos nunca são armazenados em nossos servidores.' },
    },
    howItWorks: {
      title: 'Como funciona',
      subtitle: 'Comece em segundos',
      step1: { title: 'Criar uma sala', desc: 'Gere um código de sala único ou use uma frase personalizada' },
      step2: { title: 'Compartilhar o código', desc: 'Envie o código da sala para seus amigos por qualquer canal' },
      step3: { title: 'Começar a conversar', desc: 'Mensagens desaparecem totalmente' },
    },
    download: {
      title: 'Baixar Ephchat',
      subtitle: 'Disponível em todos os seus dispositivos',
      android: { title: 'Android', desc: 'APK para Android 8.0+', btn: 'Baixar APK' },
      windows: { title: 'Windows', desc: 'Instalador para Windows', btn: 'Baixar .exe' },
      macos: { title: 'macOS', desc: 'DMG para macOS', btn: 'Baixar .dmg' },
      linux: { title: 'Linux', desc: 'AppImage para Linux', btn: 'Baixar AppImage' },
    },
    faq: {
      title: 'Perguntas frequentes',
      q1: { question: 'Como funciona a proteção de capturas de tela?', answer: 'Os apps Android e Desktop usam APIs específicas da plataforma para bloquear capturas de tela e gravações.' },
      q2: { question: 'Onde as mensagens são armazenadas?', answer: 'As mensagens nunca são armazenadas em nossos servidores. Existem apenas no seu dispositivo enquanto o chat está aberto.' },
      q3: { question: 'É criptografado de ponta a ponta?', answer: 'Sim. Toda a comunicação é criptografada de ponta a ponta usando protocolos padrão da indústria. Suas mensagens e chamadas são privadas e seguras.' },
    },
    footer: {
      product: 'Produto',
      downloads: 'Downloads',
      privacy: 'Política de privacidade',
      resources: 'Recursos',
      docs: 'Documentação',
      contact: 'Contato',
      copyright: '© 2026 Ephchat',
    },
  },

  ru: {
    meta: { title: 'Ephchat - Безопасный эфемерный мессенджер' },
    hero: {
      badge: '🔒 Конфиденциальность прежде всего',
      title: 'Общайтесь без следов',
      subtitle: 'Эфемерный мессенджер с защитой конфиденциальности. Без истории',
      downloadAndroid: 'Скачать для Android',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: 'Конфиденциальность по дизайну',
      subtitle: 'Каждая функция создана для защиты ваших разговоров',
      ephemeral: { title: 'По-настоящему эфемерный', desc: 'Сообщения исчезают, когда вы покидаете комнату. Никакой истории, никакого хранения данных.' },
      screenshot: { title: 'Защита от скриншотов', desc: 'Блокирует снимки экрана и запись. Ваши разговоры остаются приватными.' },
      anonymous: { title: 'Анонимность по умолчанию', desc: 'Без аккаунтов, без почты, без телефонов. Просто выберите псевдоним и начните общаться.' },
      encrypted: { title: 'Сквозное шифрование', desc: 'Связь шифруется при передаче.' },
      voice: { title: 'Голосовые звонки', desc: 'Высококачественные WebRTC звонки напрямую' },
      fileShare: { title: 'Передача файлов E2ECP', desc: 'Отправляйте фото, видео и документы с уверенностью. Файлы никогда не хранятся на наших серверах.' },
    },
    howItWorks: {
      title: 'Как это работает',
      subtitle: 'Начните за несколько секунд',
      step1: { title: 'Создать комнату', desc: 'Создайте уникальный код комнаты или используйте пользовательскую фразу' },
      step2: { title: 'Поделиться кодом', desc: 'Отправьте код комнаты друзьям через любой канал' },
      step3: { title: 'Начать общение', desc: 'Сообщения полностью исчезают' },
    },
    download: {
      title: 'Скачать Ephchat',
      subtitle: 'Доступно на всех ваших устройствах',
      android: { title: 'Android', desc: 'APK для Android 8.0+', btn: 'Скачать APK' },
      windows: { title: 'Windows', desc: 'Установщик для Windows', btn: 'Скачать .exe' },
      macos: { title: 'macOS', desc: 'DMG для macOS', btn: 'Скачать .dmg' },
      linux: { title: 'Linux', desc: 'AppImage для Linux', btn: 'Скачать AppImage' },
    },
    faq: {
      title: 'Часто задаваемые вопросы',
      q1: { question: 'Как работает защита от скриншотов?', answer: 'Приложения для Android и ПК используют API платформы для блокировки скриншотов и записи экрана.' },
      q2: { question: 'Где хранятся сообщения?', answer: 'Сообщения никогда не хранятся на наших серверах. Они существуют только на вашем устройстве, пока чат открыт.' },
      q3: { question: 'Есть ли сквозное шифрование?', answer: 'Да. Всё общение защищено сквозным шифрованием с использованием стандартных протоколов. Ваши сообщения и звонки приватны и безопасны.' },
    },
    footer: {
      product: 'Продукт',
      downloads: 'Загрузки',
      privacy: 'Политика конфиденциальности',
      resources: 'Ресурсы',
      docs: 'Документация',
      contact: 'Контакт',
      copyright: '© 2026 Ephchat',
    },
  },

  zh: {
    meta: { title: 'Ephchat - 安全临时消息' },
    hero: {
      badge: '🔒 隐私优先',
      title: '无痕聊天',
      subtitle: '保护隐私的临时消息。无历史记录',
      downloadAndroid: '下载 Android 版',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    features: {
      title: '隐私优先设计',
      subtitle: '每个功能都是为了保护您的对话而构建的',
      ephemeral: { title: '真正临时', desc: '离开房间后消息消失。无消息记录，无数据保留。' },
      screenshot: { title: '截图保护', desc: '阻止截图和录屏。您的对话保持私密。' },
      anonymous: { title: '默认匿名', desc: '无账号，无邮箱，无电话。只需选择昵称即可开始聊天。' },
      encrypted: { title: '端对端加密', desc: '通信在传输过程中加密。' },
      voice: { title: '语音通话', desc: '高质量 WebRTC 点对点通话' },
      fileShare: { title: 'E2ECP 文件共享', desc: '自信地发送照片、视频和文档。文件永远不会存储在我们的服务器上。' },
    },
    howItWorks: {
      title: '工作原理',
      subtitle: '几秒内即可开始',
      step1: { title: '创建房间', desc: '生成唯一的房间码或使用自定义短语' },
      step2: { title: '分享代码', desc: '通过任何渠道将房间码发送给朋友' },
      step3: { title: '开始聊天', desc: '消息完全消失' },
    },
    download: {
      title: '下载 Ephchat',
      subtitle: '适用于您的所有设备',
      android: { title: 'Android', desc: '适用于 Android 8.0+ 的 APK', btn: '下载 APK' },
      windows: { title: 'Windows', desc: 'Windows 安装程序', btn: '下载 .exe' },
      macos: { title: 'macOS', desc: 'macOS DMG', btn: '下载 .dmg' },
      linux: { title: 'Linux', desc: 'Linux AppImage', btn: '下载 AppImage' },
    },
    faq: {
      title: '常见问题',
      q1: { question: '截图保护是如何工作的？', answer: 'Android 和桌面应用使用平台特定的 API 来阻止截图捕获和屏幕录制。' },
      q2: { question: '消息存储在哪里？', answer: '消息永远不会存储在我们的服务器上。它们只在聊天开放时存在于您的设备上，并立即消失。' },
      q3: { question: '是端对端加密的吗？', answer: '是的。所有通信都使用行业标准协议进行端对端加密。您的消息和通话是私密且安全的。' },
    },
    footer: {
      product: '产品',
      downloads: '下载',
      privacy: '隐私政策',
      resources: '资源',
      docs: '文档',
      contact: '联系我们',
      copyright: '© 2026 Ephchat',
    },
  },
};

const RTL_LANGS = ['ar'];

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function applyTranslations(lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  const metaTitle = getNestedValue(t, 'meta.title');
  if (metaTitle) document.title = metaTitle;

  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = getNestedValue(t, key);
    if (value !== undefined && value !== null) {
      el.textContent = value;
    }
  });
}

function getStoredLang() {
  const stored = localStorage.getItem('lang');
  if (stored && TRANSLATIONS[stored]) return stored;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return TRANSLATIONS[browser] ? browser : 'en';
}

function setLang(lang) {
  if (!TRANSLATIONS[lang]) lang = 'en';
  localStorage.setItem('lang', lang);
  applyTranslations(lang);
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = lang;
}
