import { useThemeStore, type ThemeName } from '../context/theme.store';

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: 'light', label: 'Hell' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'midnight', label: 'Dunkel' },
];

export default function ThemeSelector() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="theme-selector-inline">
      <label className="theme-selector-label">
        Design
      </label>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeName)}
        className="theme-selector-input"
      >
        {THEMES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
