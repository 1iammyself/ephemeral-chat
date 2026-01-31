import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useConfig } from "./ConfigContext";
import { useDarkMode } from "./DarkModeContext";

export default function Navbar({ title = "e2ecp", subtitle = null }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, logout } = useAuth();
    const { storageEnabled } = useConfig();
    const { darkMode, toggleDarkMode } = useDarkMode();

    const pathname = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const loginMode = searchParams.get("mode") || "login";

    const activeClass = "bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/50";

    const isTransferActive = pathname === "/";
    const isAboutActive = pathname === "/about";
    const isStorageActive = pathname.startsWith("/storage");
    const isSettingsActive = pathname.startsWith("/settings");
    const isLoginPage = pathname === "/login";
    const isSignUpActive = isLoginPage && loginMode === "signup";
    const isSignInActive = isLoginPage && !isSignUpActive;

    return (
        <div className="sticky top-0 z-50 glass dark:glass-dark border-b border-gray-200 dark:border-white/5">
            <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="hidden sm:block sm:flex-1 sm:w-auto">
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-gray-900 dark:text-white uppercase">
                        {title}
                    </h1>
                </div>
                <div className="flex w-full sm:w-auto sm:flex-none flex-wrap sm:flex-nowrap gap-2 justify-between sm:justify-end">
                    <button
                        onClick={() => navigate("/")}
                        className={`flex items-center gap-2 border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold uppercase transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer ${isTransferActive ? activeClass : ""}`}
                        aria-current={isTransferActive ? "page" : undefined}
                    >
                        <i className="fas fa-exchange-alt"></i>
                        <span className="hidden sm:inline">Transfer</span>
                    </button>
                    <button
                        onClick={toggleDarkMode}
                        className="border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer"
                        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        <i className={`fas ${darkMode ? "fa-sun" : "fa-moon"}`}></i>
                    </button>
                    <button
                        onClick={() => navigate("/about")}
                        className={`hidden sm:inline-flex border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer ${isAboutActive ? activeClass : ""}`}
                        aria-label="About"
                        aria-current={isAboutActive ? "page" : undefined}
                    >
                        <i className="fas fa-info-circle"></i>
                    </button>
                    {isAuthenticated ? (
                        <>
                            {storageEnabled && (
                                <button
                                    onClick={() => navigate("/storage")}
                                    className={`border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold uppercase transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer ${isStorageActive ? activeClass : ""}`}
                                    aria-current={isStorageActive ? "page" : undefined}
                                >
                                    <i className="fas fa-hdd"></i>
                                </button>
                            )}
                            <button
                                onClick={() => navigate("/settings")}
                                className={`border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold uppercase transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer ${isSettingsActive ? activeClass : ""}`}
                                aria-current={isSettingsActive ? "page" : undefined}
                                aria-label="Settings"
                            >
                                <i className="fas fa-cog"></i>
                            </button>
                            <button
                                onClick={logout}
                                className="border border-red-500/20 bg-red-500/5 text-red-500 px-4 py-2.5 rounded-xl text-sm font-bold uppercase transition-all duration-200 hover:scale-105 hover:bg-red-500/10 cursor-pointer"
                                aria-label="Logout"
                            >
                                <i className="fas fa-sign-out-alt"></i>
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => navigate("/login?mode=login")}
                                className={`border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold uppercase transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer ${isSignInActive ? activeClass : ""}`}
                                aria-current={isSignInActive ? "page" : undefined}
                                aria-label="Sign In"
                            >
                                <i className="fas fa-sign-in-alt"></i>
                                <span className="ml-2">Login</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
