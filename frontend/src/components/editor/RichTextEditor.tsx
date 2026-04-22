import { useState } from 'react';
import { renderMarkdown } from '../../utils/markdown';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-300 flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={`font-medium ${!preview ? 'text-blue-600' : 'text-gray-500'}`}
        >
          Bearbeiten
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={`font-medium ${preview ? 'text-blue-600' : 'text-gray-500'}`}
        >
          Vorschau
        </button>
        <div className="ml-auto text-xs text-gray-400">
          Markdown unterstützt
        </div>
      </div>
      {preview ? (
        <div className="markdown-content p-4 min-h-64 max-w-none">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full p-4 min-h-64 font-mono text-sm resize-y outline-none"
          placeholder={placeholder || 'Beginne mit dem Schreiben in .md...'}
        />
      )}
    </div>
  );
}
