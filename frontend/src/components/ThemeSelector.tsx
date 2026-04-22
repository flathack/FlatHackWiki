import { useThemeStore, type ThemeName } from '../context/theme.store';

const THEMES: Array<{ value: ThemeName; label: string }> = [
  { value: 'light', label: 'Hell' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'midnight', label: 'Dunkel' },
];

export default function ThemeSelector() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-gray-300 bg-white/90 px-3 py-2 shadow-lg backdrop-blur sm:bottom-auto sm:top-4">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Design
      </label>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeName)}
        className="min-w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm outline-none"
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
