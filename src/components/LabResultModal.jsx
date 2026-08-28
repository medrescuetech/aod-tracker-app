import React, { useRef, useState, useEffect } from 'react';
import { X, Paperclip, FileText, CheckCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../services/api';

const DRUG_PANEL = [
  'Cannabis/THC',
  'Amphetamines (ATS)',
  'MDMA/Ecstasy',
  'Cocaine/Benzoylecgonine',
  'Opiates/Morphine',
  'Oxycodone',
  'Benzodiazepines',
  'Buprenorphine',
  'Methadone',
];

const initDrugDetails = (existing) => {
  const base = Object.fromEntries(DRUG_PANEL.map(d => [d, { detected: false, level: '', comments: '' }]));
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      parsed.forEach(({ name, level, comments }) => {
        if (base[name]) base[name] = { detected: true, level: level || '', comments: comments || '' };
      });
    } catch (_) {}
  }
  return base;
};

/**
 * Shared lab result modal.
 * Props:
 *   testId   – ID of the AODTest record
 *   onClose  – called to dismiss
 *   onSave   – called after successful save (no args)
 *   existingData – optional existing test data to pre-populate
 */
const LabResultModal = ({ testId, onClose, onSave, existingData }) => {
  const [confirmatoryResult, setConfirmatoryResult]     = useState(existingData?.ConfirmatoryResult || '');
  const [confirmatoryResultDate, setConfirmatoryResultDate] = useState(
    existingData?.ConfirmatoryResultDate ? format(parseISO(existingData.ConfirmatoryResultDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [drugDetails, setDrugDetails]                   = useState(() => initDrugDetails(existingData?.LabDrugDetails));
  const [creatinine, setCreatinine]                     = useState(existingData?.Creatinine || '');
  const [labComments, setLabComments]                   = useState(existingData?.LabComments || '');
  const [medicationReviewStatus, setMedicationReviewStatus] = useState(existingData?.MedicationReviewStatus || '');
  const [medicationReviewNotes, setMedicationReviewNotes]   = useState(existingData?.MedicationReviewNotes || '');
  const [saving, setSaving]                             = useState(false);
  const [pdfFile, setPdfFile]                           = useState(null);
  const [showClosePrompt, setShowClosePrompt]           = useState(false);
  const [savedResult, setSavedResult]                   = useState(null);
  const fileInputRef                                    = useRef(null);

  // Load test data if not provided
  useEffect(() => {
    if (!existingData && testId) {
      api.getTest(testId).then(test => {
        if (test.ConfirmatoryResult) setConfirmatoryResult(test.ConfirmatoryResult);
        if (test.ConfirmatoryResultDate) setConfirmatoryResultDate(format(parseISO(test.ConfirmatoryResultDate), 'yyyy-MM-dd'));
        if (test.LabDrugDetails) setDrugDetails(initDrugDetails(test.LabDrugDetails));
        if (test.Creatinine) setCreatinine(test.Creatinine);
        if (test.LabComments) setLabComments(test.LabComments);
        if (test.MedicationReviewStatus) setMedicationReviewStatus(test.MedicationReviewStatus);
        if (test.MedicationReviewNotes) setMedicationReviewNotes(test.MedicationReviewNotes);
      }).catch(() => {});
    }
  }, [existingData, testId]);

  const isSubstanceConfirmed = confirmatoryResult === 'Substance Confirmed';
  const isUnableToTest       = confirmatoryResult.startsWith('Lab Unable to Test');

  const updateDrug = (name, field, value) =>
    setDrugDetails(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));

  const detectedDrugs = Object.entries(drugDetails).filter(([, v]) => v.detected).map(([k]) => k);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!confirmatoryResult) { alert('Please select a confirmatory result'); return; }
    setSaving(true);
    try {
      const result = await api.recordTestLabResult(testId, {
        confirmatoryResult,
        confirmatoryResultDate,
        detectedSubstances: detectedDrugs.join(', '),
        labDrugDetails: JSON.stringify(
          Object.entries(drugDetails)
            .filter(([, v]) => v.detected)
            .map(([name, v]) => ({ name, level: v.level, comments: v.comments }))
        ),
        creatinine,
        labComments,
        medicationReviewStatus,
        medicationReviewNotes,
      });
      if (pdfFile) {
        await api.uploadTestAttachments(testId, [pdfFile], 'Lab Results', 'Lab result report');
      }
      
      // Check for auto-close conditions (BAC+ with no drug tests pending)
      const test = await api.getTest(testId);
      const isBACPositive = test?.BACFinalOutcome === 'Positive' || parseFloat(test?.BACFinalValue) > 0;
      const hasDrugTestsPending = test?.DrugTestStatus === 'Pending' || !test?.FinalDrugOutcome;
      
      if (isBACPositive && !hasDrugTestsPending) {
        // BAC+ with no drug tests - check admin auto-close setting
        const settings = await api.getAdminSettings().catch(() => ({}));
        const autoCloseEnabled = settings?.bacAutoClose !== false; // Default to true
        
        if (autoCloseEnabled) {
          // Show close case prompt
          setSavedResult(result);
          setShowClosePrompt(true);
        } else {
          // Auto-close disabled - move to In Review
          await api.updateNonNegativeStatus(testId, { status: 'In Review' });
          onSave();
        }
      } else {
        // Non-BAC or drug tests pending - normal flow
        onSave();
      }
    } catch (err) {
      alert('Failed to record lab result: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseCase = async (shouldClose) => {
    setShowClosePrompt(false);
    if (shouldClose) {
      try {
        await api.closeNonNegativeCase(testId);
      } catch (err) {
        console.error('Failed to close case:', err);
      }
    } else {
      // Move to In Review instead
      try {
        await api.updateNonNegativeStatus(testId, { status: 'In Review' });
      } catch (err) {
        console.error('Failed to update status:', err);
      }
    }
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Record Lab Result</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-4 space-y-5">

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmatory Result *</label>
                <select value={confirmatoryResult} onChange={e => setConfirmatoryResult(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required>
                  <option value="">Select result...</option>
                  <optgroup label="Standard Outcomes">
                    <option value="Negative">Negative — no substances detected</option>
                    <option value="Substance Confirmed">Substance Confirmed</option>
                    <option value="Cancelled">Cancelled / Inconclusive</option>
                  </optgroup>
                  <optgroup label="Unable to Test">
                    <option value="Lab Unable to Test - Sample Invalid">Lab unable to test — sample invalid</option>
                    <option value="Lab Unable to Test - Chain of Custody Issue">Lab unable to test — chain of custody issue</option>
                    <option value="Lab Unable to Test - Not Human Urine">Lab unable to test — not human urine</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Result Date</label>
                <input type="date" value={confirmatoryResultDate}
                  onChange={e => setConfirmatoryResultDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>

            {isUnableToTest && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                This test will be marked as <strong>Review Required</strong>. A replacement sample or further action may be needed.
              </div>
            )}

            {isSubstanceConfirmed && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Detected Substances</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-gray-50 border-b px-3 py-1.5 text-xs font-medium text-gray-500">
                    <div className="col-span-1"></div>
                    <div className="col-span-4">Drug / Substance</div>
                    <div className="col-span-3">Level (ng/mL or %)</div>
                    <div className="col-span-4">Lab Comments</div>
                  </div>
                  {DRUG_PANEL.map(drug => {
                    const d = drugDetails[drug];
                    return (
                      <div key={drug} className={`grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center text-sm ${d.detected ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <div className="col-span-1 flex justify-center">
                          <input type="checkbox" checked={d.detected}
                            onChange={e => updateDrug(drug, 'detected', e.target.checked)}
                            className="w-4 h-4 rounded accent-red-600" />
                        </div>
                        <div className={`col-span-4 font-medium text-xs ${d.detected ? 'text-red-700' : 'text-gray-600'}`}>{drug}</div>
                        <div className="col-span-3">
                          <input type="text" value={d.level} onChange={e => updateDrug(drug, 'level', e.target.value)}
                            disabled={!d.detected} placeholder={d.detected ? 'e.g. 45' : '—'}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs disabled:bg-gray-50 disabled:text-gray-400" />
                        </div>
                        <div className="col-span-4">
                          <input type="text" value={d.comments} onChange={e => updateDrug(drug, 'comments', e.target.value)}
                            disabled={!d.detected} placeholder={d.detected ? 'Notes...' : '—'}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs disabled:bg-gray-50 disabled:text-gray-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {detectedDrugs.length > 0 && (
                  <p className="text-xs text-red-600 mt-1.5 font-medium">Detected: {detectedDrugs.join(', ')}</p>
                )}
              </div>
            )}

            {(isSubstanceConfirmed || confirmatoryResult === 'Negative') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Creatinine (mmol/L) <span className="text-gray-400 font-normal">optional</span>
                  </label>
                  <input type="text" value={creatinine} onChange={e => setCreatinine(e.target.value)}
                    placeholder="e.g. 8.5" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            )}

            {confirmatoryResult && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lab Comments <span className="text-gray-400 font-normal">optional</span>
                </label>
                <textarea value={labComments} onChange={e => setLabComments(e.target.value)}
                  rows={2} placeholder="Overall comments from the laboratory report..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lab Report PDF <span className="text-gray-400 font-normal">optional</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => setPdfFile(e.target.files[0] || null)}
              />
              {pdfFile ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="flex-1 truncate text-blue-800">{pdfFile.name}</span>
                  <button type="button" onClick={() => { setPdfFile(null); fileInputRef.current.value = ''; }}
                    className="text-blue-400 hover:text-blue-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current.click()}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 w-full">
                  <Paperclip className="w-4 h-4" />
                  Attach lab report PDF
                </button>
              )}
            </div>

            {isSubstanceConfirmed && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">Medication Review Required</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Review Outcome</label>
                  <select value={medicationReviewStatus} onChange={e => setMedicationReviewStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm">
                    <option value="">Pending HSE Management Review</option>
                    <option value="Consistent">Consistent with declared medications</option>
                    <option value="Inconsistent">Inconsistent — no valid prescription</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Result Notes</label>
                  <textarea value={medicationReviewNotes} onChange={e => setMedicationReviewNotes(e.target.value)}
                    rows={2} placeholder="Result notes..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            )}
          </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Lab Result'}
          </button>
        </div>
      </form>

      {/* Close Case Prompt Modal */}
      {showClosePrompt && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">BAC Positive Case</h3>
            </div>
            <p className="text-gray-600 mb-6">
              This case has a positive BAC result with no pending drug tests. Would you like to close this case?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleCloseCase(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                Keep In Review
              </button>
              <button
                onClick={() => handleCloseCase(true)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Close Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);
};

export default LabResultModal;
