import React from 'react';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = ({ className = '' }) => {
  const { theme, effective, toggleTheme } = useTheme();

  const Icon = theme === 'system' ? SunMoon : effective === 'dark' ? Sun : Moon;
  const label = theme === 'system' ? 'System theme' : effective === 'dark' ? 'Switch to light' : 'Switch to dark';

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
        effective === 'dark'
          ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      } ${className}`}
      aria-label={label}
      title={label}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};

export default ThemeToggle;
