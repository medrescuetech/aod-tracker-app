import React, { useState, useEffect } from 'react';
import { FileText, Download, ExternalLink, Search, FolderOpen, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

const API_BASE = '/api';

const MIME_ICON = (mime = '') => {
  if (mime.includes('pdf'))   return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel'))   return '📊';
  if (mime.includes('image')) return '🖼️';
  return '📎';
};

const fmt = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const Documents = () => {
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/documents`).then(r => r.json()),
      fetch(`${API_BASE}/documents/categories`).then(r => r.json()),
    ])
      .then(([d, c]) => {
        setDocs(Array.isArray(d) ? d : []);
        setCategories(Array.isArray(c) ? c : []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d => {
    const matchCat  = activeCategory === 'All' || d.Category === activeCategory;
    const matchSearch = !search || [d.Title, d.Description, d.Category, d.FileName]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const grouped = filtered.reduce((acc, doc) => {
    const cat = doc.Category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  const openInline = (id) => window.open(`${API_BASE}/documents/${id}/file`, '_blank');
  const download   = (id) => window.open(`${API_BASE}/documents/${id}/download`, '_blank');

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-500 text-sm mt-1">Site documents, policies and reference materials</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border p-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {['All', ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No documents found</p>
          {search && <p className="text-sm mt-1">Try clearing your search</p>}
          {!search && docs.length === 0 && <p className="text-sm mt-1">Documents can be added by an administrator</p>}
        </div>
      )}

      {/* Document groups */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          {activeCategory === 'All' && (
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
              <FolderOpen className="w-4 h-4" /> {cat}
            </h2>
          )}
          <div className="bg-white rounded-xl border divide-y">
            {items.map(doc => (
              <div key={doc.DocumentID} className="flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors">
                <span className="text-2xl mt-0.5 select-none">{MIME_ICON(doc.MimeType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{doc.Title}</p>
                  {doc.Description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{doc.Description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
                    <span>{doc.FileName}</span>
                    {doc.FileSize > 0 && <span>{fmt(doc.FileSize)}</span>}
                    {doc.UploadedAt && (
                      <span>Added {format(new Date(doc.UploadedAt), 'd MMM yyyy')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => openInline(doc.DocumentID)}
                    title="Open in browser"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </button>
                  <button
                    onClick={() => download(doc.DocumentID)}
                    title="Download"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Documents;
