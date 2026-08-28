import React, { useState, useRef, useCallback } from 'react';
import { Search, User, FlaskConical, Stethoscope, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import api from '../services/api';
import { useApp } from '../context/AppContext';

const PatientSearch = () => {
  const navigate = useNavigate();
  const { hideBadgeNumber } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults(null); return; }
    setLoading(true); setError('');
    try {
      const data = await api.patientSearch(q.trim());
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { clearTimeout(debounceRef.current); doSearch(query); }
  };

  const fmtDate = (d) => { try { return d ? format(parseISO(d), 'dd/MM/yyyy') : '—'; } catch { return d || '—'; } };

  const total = results ? (results.persons?.length || 0) + (results.tests?.length || 0) + (results.events?.length || 0) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Search className="w-6 h-6 text-blue-600" /> Patient Search
        </h1>
        <p className="text-gray-500 mt-1">Search across AOD tests, patient records, and clinical events</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, badge number, test number… (partial names work)"
          className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-base shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin" />}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {query.length === 1 && (
        <p className="text-sm text-gray-400 text-center py-4">Type at least 2 characters to search</p>
      )}

      {results && total === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="font-medium">No results found for "{query}"</p>
          <p className="text-sm mt-1">Try a partial name, badge number, or test number</p>
        </div>
      )}

      {results && total > 0 && (
        <div className="space-y-6">

          {/* Patients / Persons */}
          {results.persons?.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                <User className="w-4 h-4" /> Patients ({results.persons.length})
              </h2>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y">
                {results.persons.map(p => (
                  <button
                    key={p.PersonID}
                    onClick={() => navigate(`/patient/${p.PersonID}`)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.FullName}</p>
                        <p className="text-xs text-gray-500">
                          {p.EmployerName || 'No employer'}
                          {!hideBadgeNumber && p.BadgeNumber ? ` · Badge: ${p.BadgeNumber}` : ''}
                          {p.DateOfBirth ? ` · DOB: ${fmtDate(p.DateOfBirth)}` : ''}
                          {` · ${p.TestCount || 0} test${p.TestCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* AOD Tests */}
          {results.tests?.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                <FlaskConical className="w-4 h-4" /> AOD Tests ({results.tests.length})
              </h2>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y">
                {results.tests.map(t => (
                  <button
                    key={t.TestID}
                    onClick={() => navigate(`/tests/${t.TestID}`)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                        <FlaskConical className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {t.PersonName}
                          {t.TestNumber && <span className="ml-2 text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.TestNumber}</span>}
                          {t.IsPending ? <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Pending</span> : null}
                        </p>
                        <p className="text-xs text-gray-500">
                          {fmtDate(t.TestDate)}
                          {t.TestTypeName ? ` · ${t.TestTypeName}` : ''}
                          {t.EmployerName ? ` · ${t.EmployerName}` : ''}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Clinical Events */}
          {results.events?.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                <Stethoscope className="w-4 h-4" /> Clinical Events ({results.events.length})
              </h2>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y">
                {results.events.map(e => (
                  <div key={e.EventID} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <Stethoscope className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{e.PersonName}</p>
                      <p className="text-xs text-gray-500">
                        {fmtDate(e.EventDate)}
                        {e.EventType ? ` · ${e.EventType}` : ''}
                        {e.InjuryType ? ` · ${e.InjuryType}` : ''}
                        {e.WrNwr ? ` · ${e.WrNwr}` : ''}
                        {e.EmployerName ? ` · ${e.EmployerName}` : ''}
                      </p>
                      {e.Comment && <p className="text-xs text-gray-400 truncate mt-0.5">{e.Comment}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default PatientSearch;
