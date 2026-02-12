import React from 'react';
import { ArrowLeft, Shield, Lock, Eye, Trash2, Smartphone, Globe, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const PrivacyPolicy = () => {
    const navigate = useNavigate();

    return (
        <div className="h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-y-auto scrollbar-thin flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center gap-2 group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        <span className="hidden sm:inline font-medium">Back</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        <h1 className="text-lg sm:text-xl font-bold tracking-tight">Privacy Policy</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-grow">
                <div className="space-y-8 sm:space-y-12">
                    {/* Hero Section */}
                    <header className="prose prose-indigo dark:prose-invert max-w-none border-b border-gray-100 dark:border-gray-800 pb-8">
                        <h1 className="text-2xl sm:text-3xl font-extrabold mb-4">Privacy Policy for Ephemeral Chat</h1>
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-6">
                            Last Updated: February 5, 2026
                        </div>
                        <p className="text-lg sm:text-xl leading-relaxed text-gray-600 dark:text-gray-400 font-medium italic">
                            Ephemeral Chat ("the App") is built with a "Privacy by Design" philosophy. Our goal is to provide a secure, anonymous communication platform where your data stays yours.
                        </p>
                    </header>

                    {/* 1. Information Collection */}
                    <section>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            <Eye className="w-6 h-6 text-indigo-600" /> 1. Information Collection
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                <h3 className="font-bold text-lg mb-2">No Personal Data</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">We do not require registration, names, email addresses, or phone numbers.</p>
                            </div>
                            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                <h3 className="font-bold text-lg mb-2">No Message Logs</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Messages are ephemeral. They are held in memory only as long as necessary for delivery and are never permanently stored on our servers.</p>
                            </div>
                            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                <h3 className="font-bold text-lg mb-2">Anonymous Usage</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">We do not track individual users or create user profiles.</p>
                            </div>
                        </div>
                    </section>

                    {/* 2. Device Permissions */}
                    <section>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            <Smartphone className="w-6 h-6 text-indigo-600" /> 2. Device Permissions
                        </h2>
                        <p className="mb-4 text-gray-600 dark:text-gray-400">The App requires the following permissions to function:</p>

                        {/* Mobile view for permissions */}
                        <div className="md:hidden space-y-4">
                            {[
                                { name: "Internet Access", purpose: "Required to connect to chat rooms and transmit messages/calls.", handling: "Encrypted data transmitted to our relay servers." },
                                { name: "Microphone", purpose: "Used only when you explicitly start a voice call or record a voice note.", handling: "Audio is transmitted peer-to-peer or processed for immediate delivery and is not recorded by the developer." },
                                { name: "Camera", purpose: "Used only when you explicitly capture a photo to share in chat.", handling: "Photos are encrypted and transmitted directly to chat recipients. We do not store or access your photos." },
                                { name: "File Access", purpose: "Used when you choose to send or receive files in chat.", handling: "Files are encrypted end-to-end and transmitted directly between users. We do not store or access your files." },
                                { name: "Local Storage", purpose: "Used to optionally save chat history locally on your device (if you enable persistent mode).", handling: "Data is stored only on your device and is never uploaded to our servers." }
                            ].map((perm, idx) => (
                                <div key={idx} className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                    <h3 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2">{perm.name}</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Purpose</span>
                                            <p className="text-sm font-medium mt-0.5">{perm.purpose}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Data Handling</span>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{perm.handling}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop view for permissions */}
                        <div className="hidden md:block overflow-hidden border border-gray-200 dark:border-gray-800 rounded-2xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="p-4 font-bold border-b border-gray-200 dark:border-gray-700">Permission</th>
                                        <th className="p-4 font-bold border-b border-gray-200 dark:border-gray-700">Purpose</th>
                                        <th className="p-4 font-bold border-b border-gray-200 dark:border-gray-700">Data Handling</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    <tr>
                                        <td className="p-4 font-semibold">Internet Access</td>
                                        <td className="p-4 text-sm">Required to connect to chat rooms and transmit messages/calls.</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">Encrypted data transmitted to our relay servers.</td>
                                    </tr>
                                    <tr>
                                        <td className="p-4 font-semibold">Microphone</td>
                                        <td className="p-4 text-sm">Used only when you explicitly start a voice call or record a voice note.</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">Audio is transmitted peer-to-peer or processed for immediate delivery and is not recorded by the developer.</td>
                                    </tr>
                                    <tr>
                                        <td className="p-4 font-semibold">Camera</td>
                                        <td className="p-4 text-sm">Used only when you explicitly capture a photo to share in chat.</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">Photos are encrypted and transmitted directly to chat recipients. We do not store or access your photos.</td>
                                    </tr>
                                    <tr>
                                        <td className="p-4 font-semibold">File Access</td>
                                        <td className="p-4 text-sm">Used when you choose to send or receive files in chat.</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">Files are encrypted end-to-end and transmitted directly between users. We do not store or access your files.</td>
                                    </tr>
                                    <tr>
                                        <td className="p-4 font-semibold">Local Storage</td>
                                        <td className="p-4 text-sm">Used to optionally save chat history locally on your device (if you enable persistent mode).</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-400">Data is stored only on your device and is never uploaded to our servers.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                        {/* 3. Data Encryption */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-indigo-600" /> 3. Data Encryption
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                <li>All messages are encrypted client-side using <strong>AES-GCM</strong>.</li>
                                <li>The encryption keys are stored in the URL hash of your chat room and are <strong>never sent to our servers</strong>.</li>
                                <li>Only people with the specific room link can decrypt messages.</li>
                                <li>File transfers use end-to-end encryption.</li>
                            </ul>
                        </section>

                        {/* 4. Local Storage (Persistent Mode) */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Trash2 className="w-5 h-5 text-indigo-600" /> 4. Local Storage
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                <li>If you enable persistent storage, your chat history is saved only on your device.</li>
                                <li>This data never leaves your device and is not accessible to us.</li>
                                <li>You can delete this data at any time through the app settings.</li>
                            </ul>
                        </section>

                        {/* 5. Third-Party Sharing */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-indigo-600" /> 5. Third-Party Sharing
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                <li>We do <strong>not</strong> sell, trade, or share any information with third parties.</li>
                                <li>We do <strong>not</strong> use third-party analytics or advertising trackers.</li>
                            </ul>
                        </section>

                        {/* 6. Desktop App (Electron) */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-indigo-600" /> 6. Desktop App (Electron)
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                <li><strong>Screen Capture Protection:</strong> Prevents screenshots and screen recording on Windows.</li>
                                <li><strong>Sandboxed Execution:</strong> The app runs in an isolated environment for security.</li>
                                <li><strong>No Telemetry:</strong> The desktop app does not collect or transmit usage data.</li>
                            </ul>
                        </section>
                    </div>

                    {/* 7. Data Retention */}
                    <section className="p-6 md:p-8 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-3xl border border-indigo-100/50 dark:border-indigo-800/50">
                        <h2 className="text-2xl font-bold mb-6">7. Data Retention</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Messages</span>
                                <span className="text-sm font-medium">Automatically deleted based on room settings (30 seconds to 1 hour).</span>
                            </div>
                            <div className="flex flex-col p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Rooms</span>
                                <span className="text-sm font-medium">Expire and are deleted after 24 hours of inactivity.</span>
                            </div>
                            <div className="flex flex-col p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Files</span>
                                <span className="text-sm font-medium">Not stored on our servers; transmitted directly between users.</span>
                            </div>
                            <div className="flex flex-col p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Local Data</span>
                                <span className="text-sm font-medium">Retained on your device until you delete it.</span>
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pt-8">
                        {/* 8. Children's Privacy */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 underline decoration-indigo-500/30 underline-offset-8">8. Children's Privacy</h2>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                The App is not intended for children under 13. We do not knowingly collect any information from children.
                            </p>
                        </section>

                        {/* 9. Changes to This Policy */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 underline decoration-indigo-500/30 underline-offset-8">9. Changes to This Policy</h2>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last Updated" date.
                            </p>
                        </section>
                    </div>

                    {/* 10. Contact */}
                    <section className="pt-12 border-t border-gray-100 dark:border-gray-800">
                        <h2 className="text-2xl font-bold mb-6">10. Contact</h2>
                        <p className="mb-6 text-gray-600 dark:text-gray-400">If you have any questions about this Privacy Policy, you can reach out via:</p>

                        <a
                            href="https://github.com/cLLeB/ephemeral-chat"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-3 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl hover:bg-black dark:hover:bg-gray-700 transition-all font-medium"
                        >
                            <Github className="w-5 h-5" />
                            GitHub Repository
                        </a>
                    </section>

                    {/* Footer note */}
                    <footer className="pt-12 text-center">
                        <p className="text-gray-400 dark:text-gray-500 text-xs font-medium bg-gray-50 dark:bg-gray-800/50 inline-block px-4 py-2 rounded-full">
                            This privacy policy applies to Ephemeral Chat version 1.1.0 and later.
                        </p>
                    </footer>
                </div>
            </main>
        </div>
    );
};

export default PrivacyPolicy;
