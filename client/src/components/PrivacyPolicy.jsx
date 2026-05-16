import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Shield, Lock, Eye, Trash2, Smartphone, Globe, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const PrivacyPolicy = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [activeSection1, setActiveSection1] = useState(0);
    const [activeSection2, setActiveSection2] = useState(0);
    const [activeSection7, setActiveSection7] = useState(0);

    const scrollRef1 = useRef(null);
    const scrollRef2 = useRef(null);
    const scrollRef7 = useRef(null);

    const handleScroll = (ref, setter) => {
        if (ref.current) {
            const index = Math.round(ref.current.scrollLeft / ref.current.offsetWidth);
            setter(index);
        }
    };

    return (
        <div className="h-screen w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-10 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center gap-2 group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        <span className="hidden sm:inline font-medium">{t('privacy.back')}</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        <h1 className="text-lg sm:text-xl font-bold tracking-tight">{t('privacy.title')}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-grow overflow-x-hidden">
                <div className="space-y-8 sm:space-y-12">
                    {/* Hero Section */}
                    <header className="prose prose-indigo dark:prose-invert max-w-none border-b border-gray-100 dark:border-gray-800 pb-8">
                        <h1 className="text-2xl sm:text-3xl font-extrabold mb-4">{t('privacy.hero.pageTitle')}</h1>
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-6">
                            {t('privacy.hero.lastUpdated')}
                        </div>
                        <p className="text-lg sm:text-xl leading-relaxed text-gray-600 dark:text-gray-400 font-medium italic">
                            {t('privacy.hero.intro')}
                        </p>
                    </header>

                    {/* 1. Information Collection */}
                    <section>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            <Eye className="w-6 h-6 text-indigo-600" /> {t('privacy.s1.title')}
                        </h2>

                        {/* Mobile Carousel */}
                        <div className="md:hidden relative group w-full overflow-hidden">
                            <div
                                ref={scrollRef1}
                                onScroll={() => handleScroll(scrollRef1, setActiveSection1)}
                                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 pb-4 w-full"
                            >
                                {[0, 1, 2].map((idx) => (
                                    <div key={idx} className="w-full flex-shrink-0 snap-center">
                                        <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 h-full">
                                            <h3 className="font-bold text-lg mb-2">{t(`privacy.s1.cards.${idx}.title`)}</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">{t(`privacy.s1.cards.${idx}.desc`)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-1.5 mt-2">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${activeSection1 === i ? 'w-4 bg-indigo-600' : 'w-1.5 bg-gray-300 dark:bg-gray-700'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Desktop Grid */}
                        <div className="hidden md:grid grid-cols-3 gap-6">
                            {[0, 1, 2].map((idx) => (
                                <div key={idx} className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                    <h3 className="font-bold text-lg mb-2">{t(`privacy.s1.cards.${idx}.title`)}</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{t(`privacy.s1.cards.${idx}.desc`)}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 2. Device Permissions */}
                    <section>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            <Smartphone className="w-6 h-6 text-indigo-600" /> {t('privacy.s2.title')}
                        </h2>
                        <p className="mb-4 text-gray-600 dark:text-gray-400">{t('privacy.s2.subtitle')}</p>

                        {/* Mobile Carousel */}
                        <div className="md:hidden relative w-full overflow-hidden">
                            <div
                                ref={scrollRef2}
                                onScroll={() => handleScroll(scrollRef2, setActiveSection2)}
                                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 pb-4 w-full"
                            >
                                {[0, 1, 2, 3, 4].map((idx) => (
                                    <div key={idx} className="w-full flex-shrink-0 snap-center">
                                        <div className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 h-full">
                                            <h3 className="font-bold text-indigo-600 dark:text-indigo-400 mb-3">{t(`privacy.s2.perms.${idx}.name`)}</h3>
                                            <div className="space-y-4">
                                                <div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('privacy.s2.colPurpose')}</span>
                                                    <p className="text-sm font-medium mt-1">{t(`privacy.s2.perms.${idx}.purpose`)}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('privacy.s2.colHandling')}</span>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t(`privacy.s2.perms.${idx}.handling`)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-1.5 mt-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${activeSection2 === i ? 'w-4 bg-indigo-600' : 'w-1.5 bg-gray-300 dark:bg-gray-700'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-hidden border border-gray-200 dark:border-gray-800 rounded-2xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="p-4 font-bold border-b border-gray-200 dark:border-gray-700">{t('privacy.s2.colPerm')}</th>
                                        <th className="p-4 font-bold border-b border-gray-200 dark:border-gray-700">{t('privacy.s2.colPurpose')}</th>
                                        <th className="p-4 font-bold border-b border-gray-200 dark:border-gray-700">{t('privacy.s2.colHandling')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {[0, 1, 2, 3, 4].map((idx) => (
                                        <tr key={idx}>
                                            <td className="p-4 font-semibold">{t(`privacy.s2.perms.${idx}.name`)}</td>
                                            <td className="p-4 text-sm">{t(`privacy.s2.perms.${idx}.purpose`)}</td>
                                            <td className="p-4 text-sm text-gray-600 dark:text-gray-400">{t(`privacy.s2.perms.${idx}.handling`)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                        {/* 3. Data Encryption */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-indigo-600" /> {t('privacy.s3.title')}
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                {['b0', 'b1', 'b2', 'b3'].map((k) => (
                                    <li key={k} dangerouslySetInnerHTML={{ __html: t(`privacy.s3.${k}`) }} />
                                ))}
                            </ul>
                        </section>

                        {/* 4. Local Storage */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Trash2 className="w-5 h-5 text-indigo-600" /> {t('privacy.s4.title')}
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                {['b0', 'b1', 'b2'].map((k) => (
                                    <li key={k}>{t(`privacy.s4.${k}`)}</li>
                                ))}
                            </ul>
                        </section>

                        {/* 5. Third-Party Sharing */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-indigo-600" /> {t('privacy.s5.title')}
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                {['b0', 'b1'].map((k) => (
                                    <li key={k} dangerouslySetInnerHTML={{ __html: t(`privacy.s5.${k}`) }} />
                                ))}
                            </ul>
                        </section>

                        {/* 6. Desktop App */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-indigo-600" /> {t('privacy.s6.title')}
                            </h2>
                            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                                {['b0', 'b1', 'b2'].map((k) => (
                                    <li key={k} dangerouslySetInnerHTML={{ __html: t(`privacy.s6.${k}`) }} />
                                ))}
                            </ul>
                        </section>
                    </div>

                    {/* 7. Data Retention */}
                    <section className="p-6 md:p-8 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-3xl border border-indigo-100/50 dark:border-indigo-800/50">
                        <h2 className="text-2xl font-bold mb-6">{t('privacy.s7.title')}</h2>

                        {/* Mobile Carousel */}
                        <div className="md:hidden relative w-full overflow-hidden">
                            <div
                                ref={scrollRef7}
                                onScroll={() => handleScroll(scrollRef7, setActiveSection7)}
                                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 pb-4 w-full"
                            >
                                {[0, 1, 2, 3].map((idx) => (
                                    <div key={idx} className="w-full flex-shrink-0 snap-center">
                                        <div className="flex flex-col p-5 bg-white dark:bg-gray-800 rounded-2xl shadow-sm h-full border border-gray-100 dark:border-gray-700/50">
                                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">{t(`privacy.s7.items.${idx}.label`)}</span>
                                            <span className="text-sm font-medium leading-relaxed">{t(`privacy.s7.items.${idx}.value`)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-1.5 mt-2">
                                {[0, 1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${activeSection7 === i ? 'w-4 bg-indigo-600' : 'w-1.5 bg-gray-300 dark:bg-gray-700'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Desktop Grid */}
                        <div className="hidden md:grid grid-cols-2 gap-4">
                            {[0, 1, 2, 3].map((idx) => (
                                <div key={idx} className="flex flex-col p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">{t(`privacy.s7.items.${idx}.label`)}</span>
                                    <span className="text-sm font-medium">{t(`privacy.s7.items.${idx}.value`)}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pt-8">
                        {/* 8. Children's Privacy */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 underline decoration-indigo-500/30 underline-offset-8">{t('privacy.s8.title')}</h2>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">{t('privacy.s8.text')}</p>
                        </section>

                        {/* 9. Changes to This Policy */}
                        <section>
                            <h2 className="text-xl font-bold mb-4 underline decoration-indigo-500/30 underline-offset-8">{t('privacy.s9.title')}</h2>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">{t('privacy.s9.text')}</p>
                        </section>
                    </div>

                    {/* 10. Contact */}
                    <section className="pt-12 border-t border-gray-100 dark:border-gray-800">
                        <h2 className="text-2xl font-bold mb-6">{t('privacy.s10.title')}</h2>
                        <p className="mb-6 text-gray-600 dark:text-gray-400">{t('privacy.s10.subtitle')}</p>

                        <a
                            href="https://github.com/cLLeB/ephemeral-chat"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-3 px-6 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl hover:bg-black dark:hover:bg-gray-700 transition-all font-medium"
                        >
                            <Github className="w-5 h-5" />
                            {t('privacy.s10.github')}
                        </a>
                    </section>

                    {/* Footer note */}
                    <footer className="pt-12 text-center">
                        <p className="text-gray-400 dark:text-gray-500 text-xs font-medium bg-gray-50 dark:bg-gray-800/50 inline-block px-4 py-2 rounded-full">
                            {t('privacy.footer')}
                        </p>
                    </footer>
                </div>
            </main>
        </div>
    );
};

export default PrivacyPolicy;
