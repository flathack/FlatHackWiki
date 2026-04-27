import { useId } from 'react';
import { useThemeStore, type ThemeName } from '../context/theme.store';

const THEMES: Array<{ value: ThemeName; label: string; icon: string }> = [
  { value: 'light', label: 'Hell', icon: 'H' },
  { value: 'oled', label: 'OLED', icon: 'O' },
  { value: 'midnight', label: 'Dunkel', icon: 'D' },
];

export default function ThemeSelector() {
  const { theme, setTheme } = useThemeStore();
  const labelId = useId();

  return (
    <div className="theme-selector-inline" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="theme-selector-label">Design</span>
      <div className="theme-segmented-control">
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`theme-segment ${theme === option.value ? 'active' : ''}`}
            onClick={() => setTheme(option.value)}
            title={option.label}
            aria-pressed={theme === option.value}
          >
            <span aria-hidden="true">{option.icon}</span>
            <strong>{option.label}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
