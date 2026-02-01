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
                <div className="flex w-full items-center justify-between">
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-gray-900 dark:text-white uppercase">
                        {title}
                    </h1>
                    <button
                        onClick={toggleDarkMode}
                        className="border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-white/10 cursor-pointer"
                        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        <i className={`fas ${darkMode ? "fa-sun" : "fa-moon"}`}></i>
                    </button>
                </div>
            </div>
        </div>
    );
}
