import { useState } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [preview, setPreview] = useState(false);

  const renderMarkdown = (text: string) => {
    if (!text) return '';
    let html = text
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
      .replace(/^\*(.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>')
      .replace(/\n/g, '<br/>');
    return html;
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-300 flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={`font-medium ${!preview ? 'text-blue-600' : 'text-gray-500'}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={`font-medium ${preview ? 'text-blue-600' : 'text-gray-500'}`}
        >
          Preview
        </button>
        <div className="ml-auto text-xs text-gray-400">
          Markdown supported
        </div>
      </div>
      {preview ? (
        <div className="p-4 min-h-64 prose max-w-none">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full p-4 min-h-64 font-mono text-sm resize-y outline-none"
          placeholder={placeholder || 'Start writing... (Markdown supported)'}
        />
      )}
    </div>
  );
}
