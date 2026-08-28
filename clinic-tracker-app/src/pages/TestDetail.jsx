import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Upload, Download, Trash2, Clock, AlertTriangle, CheckCircle, XCircle, Loader2, Paperclip, Edit2, Save, X, Printer, Mail, Send } from 'lucide-react';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import { format } from 'date-fns';
import LabResultModal from '../components/LabResultModal';

function computeOverallAODResult(drug, bac) {
  const d = drug || '';
  const b = bac  || '';
  if (d === 'Refused')   return 'Refused';
  if (d === 'Invalid')   return 'Invalid';
  if (b === 'Positive')  return 'Alcohol Positive';
  if (d === 'Pending Confirmation') return 'Drug Non-Negative Pending';
  if (d === 'Confirmed - Inconsistent') return 'Drug Confirmed - Inconsistent';
  if (d === 'Confirmed - Consistent with Declaration') return 'Drug Confirmed - Consistent';
  if (d.includes('Pending HSE Management Review') || d === 'Confirmed - Pending Review') return 'Review Required';
  if (d === 'Cancelled') return 'Cancelled';
  if (['Negative', 'Confirmed Negative', ''].includes(d) && ['Negative', 'N/A', ''].includes(b)) return 'Negative';
  return d ? 'Review Required' : null;
}

const TestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lookups, hideBadgeNumber } = useApp();
  const [test, setTest] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showLabResultModal, setShowLabResultModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [clinicians, setClinicians] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [requireCocUploads, setRequireCocUploads] = useState(false);
  const [printing, setPrinting] = useState(false);
  const printSectionRef = useRef(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  useEffect(() => {
    loadTest();
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => setRequireCocUploads(cfg.require_coc_uploads === 'true'))
      .catch(() => {});
  }, [id]);

  const loadTest = async () => {
    setLoading(true);
    try {
      const [testData, attachmentData, cliniciansData, employersData] = await Promise.all([
        api.getTest(id),
        api.getTestAttachments(id),
        api.getClinicians(),
        api.getEmployers()
      ]);
      setTest(testData);
      setAttachments(attachmentData || []);
      setClinicians(cliniciansData || []);
      setEmployers(employersData || []);
    } catch (err) {
      console.error('Failed to load test:', err);
      alert('Failed to load test: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    setEditForm({
      testDate: test.TestDate,
      testTime: test.TestTime || '',
      testTypeId: test.TestTypeID,
      clinicianId: test.ClinicianID || '',
      oralUndertaken: test.OralUndertaken,
      oralResult: test.OralResult || '',
      oralDeviceId: test.OralDeviceID || '',
      bacUndertaken: test.BACUndertaken,
      bacInitialValue: test.BACInitialValue ?? '',
      bacInitialTime: test.BACInitialTime || '',
      bacFinalValue: test.BACFinalValue ?? '',
      bacFinalTime: test.BACFinalTime || '',
      bacDeviceId: test.BACDeviceID || '',
      urineUndertaken: test.UrineUndertaken,
      urineResult: test.UrineResult || '',
      urineSampleId: test.UrineSampleID || '',
      sampleSentToLab: test.SampleSentToLab,
      labReference: test.LabReference || '',
      labRequestType: test.LabRequestType || 'specific',
      labRequestNotes: test.LabRequestNotes || '',
      notes: test.Notes || '',
      confirmatoryResult: test.ConfirmatoryResult || '',
      detectedSubstances: test.DetectedSubstances || '',
      medicationReviewStatus: test.MedicationReviewStatus || '',
      medicationReviewNotes: test.MedicationReviewNotes || '',
      declaredMedications: test.DeclaredMedications || ''
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditForm({});
  };

  const formatBAC = (field, value) => {
    const num = parseFloat(value);
    if (!isNaN(num)) setEditForm(f => ({ ...f, [field]: num.toFixed(3) }));
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateTest(id, editForm);
      navigate('/');
    } catch (err) {
      alert('Failed to save: ' + err.message);
      setSaving(false);
    }
  };

  const handleFileUpload = async (e, category) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      await api.uploadTestAttachments(id, files, category);
      const newAttachments = await api.getTestAttachments(id);
      setAttachments(newAttachments || []);
      e.target.value = '';
    } catch (err) {
      alert('Failed to upload: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.deleteAttachment(attachmentId);
      setAttachments(attachments.filter(a => a.AttachmentID !== attachmentId));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Closed': 'bg-green-100 text-green-800',
      'Pending Lab': 'bg-amber-100 text-amber-800',
      'Action Required': 'bg-red-100 text-red-800',
      'Review Required': 'bg-purple-100 text-purple-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      // Separate image vs PDF attachments
      const imageAtts = attachments.filter(a => /\.(jpe?g|png|gif|webp)$/i.test(a.OriginalFileName || a.FileName || ''));
      const pdfAtts   = attachments.filter(a => /\.pdf$/i.test(a.OriginalFileName || a.FileName || ''));

      // Fetch images as data URLs so they embed in the print output
      const imageData = await Promise.all(
        imageAtts.map(async att => {
          try {
            const resp = await fetch(api.getAttachmentDownloadUrl(att.AttachmentID));
            const blob = await resp.blob();
            return await new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve({ att, dataUrl: reader.result });
              reader.readAsDataURL(blob);
            });
          } catch { return null; }
        })
      ).then(r => r.filter(Boolean));

      // Build print-only HTML block and inject into a hidden div
      const resultColor = (() => {
        const r = test.OverallAODResult || computeOverallAODResult(test.FinalDrugOutcome, test.FinalBACOutcome);
        if (!r) return '#6b7280';
        if (r === 'Negative') return '#16a34a';
        if (r.includes('Positive') || r.includes('Inconsistent')) return '#dc2626';
        return '#d97706';
      })();

      const field = (label, value) => value
        ? `<div class="pf"><span class="pl">${label}</span><span class="pv">${value}</span></div>`
        : '';

      const section = (title, content) =>
        `<div class="ps"><div class="psh">${title}</div><div class="psc">${content}</div></div>`;

      const overallResult = test.OverallAODResult || computeOverallAODResult(test.FinalDrugOutcome, test.FinalBACOutcome) || 'Pending';

      const html = `
        <div id="__print_test__" class="pr">
          <div class="phead">
            <div>
              <div class="ptnum">${test.TestNumber}</div>
              <div class="ptdate">${format(new Date(test.TestDate), 'EEEE, MMMM d, yyyy')}${test.TestTime ? ' at ' + test.TestTime : ''}</div>
            </div>
            <div class="presult" style="color:${resultColor}">${overallResult}</div>
          </div>
          ${section('Donor Details', [
            field('Name', test.PersonName || test.DonorName),
            field('Employer', test.EmployerName),
            field('Test Type', test.TestTypeName),
            field('Clinician', test.ClinicianName),
            !hideBadgeNumber ? field('Badge / Employee #', test.BadgeNumber || test.EmployeeNumber) : '',
            field('ID Sighted', test.IDSighted ? 'Yes' : 'No'),
            test.IDSighted ? field('ID Details', [test.IDType, test.IDNumber].filter(Boolean).join(' — ')) : '',
          ].join(''))}
          ${section('Alcohol (BAC)', [
            field('Undertaken', test.BACUndertaken ? 'Yes' : 'No'),
            test.BACUndertaken ? field('Initial BAC', test.BACInitialValue != null ? test.BACInitialValue.toFixed(3) + '%' + (test.BACInitialTime ? ' @ ' + test.BACInitialTime : '') : '-') : '',
            test.BACUndertaken ? field('Final BAC', test.BACFinalValue != null ? test.BACFinalValue.toFixed(3) + '%' + (test.BACFinalTime ? ' @ ' + test.BACFinalTime : '') : '-') : '',
            test.BACUndertaken ? field('Device', test.BACDeviceID) : '',
            field('Alcohol Outcome', test.FinalBACOutcome),
          ].join(''))}
          ${section('Drug Screening', [
            field('Oral Result', test.OralResult),
            test.OralResult && test.OralSubstances ? field('Oral Substances', test.OralSubstances) : '',
            test.OralDeviceID ? field('Oral Device', test.OralDeviceID) : '',
            field('Urine Result', test.UrineResult),
            test.UrineResult && test.UrineSubstances ? field('Urine Substances', test.UrineSubstances) : '',
            test.UrineSampleID ? field('Urine Sample ID', test.UrineSampleID) : '',
            field('Sent to Lab', test.SampleSentToLab ? 'Yes' : 'No'),
            test.LabReference ? field('Lab Reference', test.LabReference) : '',
            field('Drug Outcome', test.FinalDrugOutcome),
          ].join(''))}
          ${(test.ConfirmatoryResult || test.MedicationReviewStatus || test.DeclaredMedications) ? section('Confirmatory / Medication Review', [
            field('Lab Result', test.ConfirmatoryResult),
            field('Detected Substances', test.DetectedSubstances),
            field('Declared Medications', test.DeclaredMedications),
            field('Medication Review', test.MedicationReviewStatus),
            field('Review Notes', test.MedicationReviewNotes),
          ].join('')) : ''}
          ${test.Notes ? section('Notes', `<p class="pnotes">${test.Notes}</p>`) : ''}
          ${imageData.length > 0 ? '<div class="pah">Attachments</div>' + imageData.map(({ att, dataUrl }) =>
            `<div class="pa"><div class="pan">${att.OriginalFileName || att.FileName} <span class="pac">${att.Category}</span></div><img src="${dataUrl}" class="paimg" /></div>`
          ).join('') : ''}
          ${pdfAtts.length > 0 ? `<div class="ppdfs">PDF Attachments (${pdfAtts.length}): ${pdfAtts.map(a => a.OriginalFileName || a.FileName).join(', ')} — opening in separate tabs</div>` : ''}
        </div>`;

      // Inject into hidden print-only div
      if (printSectionRef.current) {
        printSectionRef.current.innerHTML = html;
      }

      // Small delay so browser paints, then print
      await new Promise(r => setTimeout(r, 100));
      window.print();

      // After print dialog closes, open PDFs in new tabs
      pdfAtts.forEach(att => window.open(api.getAttachmentDownloadUrl(att.AttachmentID), '_blank'));

      // Clear injected HTML
      if (printSectionRef.current) printSectionRef.current.innerHTML = '';
    } finally {
      setPrinting(false);
    }
  };

  const getOutcomeBadge = (outcome) => {
    if (!outcome || outcome === 'N/A') return 'bg-gray-100 text-gray-600';
    if (outcome === 'Negative') return 'bg-green-100 text-green-800';
    if (outcome.includes('Positive') || outcome.includes('Confirmed')) return 'bg-red-100 text-red-800';
    if (outcome.includes('Pending')) return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!test) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Test not found</p>
        <button onClick={() => navigate('/tests')} className="mt-4 text-blue-600 hover:underline">Back to Tests</button>
      </div>
    );
  }

  const isPending = test.TestStatus === 'Pending Lab' || test.FinalDrugOutcome?.includes('Pending');
  const isClosed = test.TestStatus === 'Closed';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/tests')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{test.TestNumber}</h1>
          <p className="text-gray-500">{format(new Date(test.TestDate), 'EEEE, MMMM d, yyyy')} at {test.TestTime || '-'}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(test.TestStatus)}`}>
          {test.TestStatus}
        </span>
        <button onClick={() => { setEmailTo(''); setEmailSubject(`AOD Test Report — ${test.TestNumber} — ${test.PersonName || test.DonorName || ''}`); setEmailStatus(null); setShowEmailModal(true); }} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 no-print">
          <Mail className="w-4 h-4" /> Email
        </button>
        <button onClick={handlePrint} disabled={printing} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 no-print">
          <Printer className="w-4 h-4" /> {printing ? 'Preparing...' : 'Print'}
        </button>
        {!editMode ? (
          <button onClick={startEdit} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 no-print">
            <Edit2 className="w-4 h-4" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={cancelEdit} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={saveEdit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Status Alert for Pending Tests */}
      {isPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">Awaiting Lab Results</p>
              <p className="text-sm text-amber-700 mt-1">
                Sample has been sent for confirmatory testing. Record the lab result when received.
              </p>
              <button 
                onClick={() => setShowLabResultModal(true)}
                className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
              >
                Record Lab Result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Details */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Test Details</h2>
        
        {!editMode ? (
          <>
            {/* View Mode */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-sm text-gray-500">Donor</label>
                <p className="font-medium">{test.PersonName || test.DonorName || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Employer</label>
                <p className="font-medium">{test.EmployerName || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Test Type</label>
                <p className="font-medium">{test.TestTypeName || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Clinician</label>
                <p className="font-medium">{test.ClinicianName || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">RFT</label>
                <p className="font-medium">{test.RFT ? 'Yes' : 'No'}</p>
              </div>
              {!hideBadgeNumber && (
              <div>
                <label className="text-sm text-gray-500">Badge/Employee #</label>
                <p className="font-medium">{test.BadgeNumber || test.EmployeeNumber || '-'}</p>
              </div>
              )}
              <div>
                <label className="text-sm text-gray-500">ID Sighted</label>
                <p className={`font-medium ${test.IDSighted ? 'text-green-700' : 'text-gray-400'}`}>
                  {test.IDSighted ? 'Yes' : 'No'}
                </p>
              </div>
              {test.IDSighted && (test.IDType || test.IDNumber) && (
                <div className="col-span-2">
                  <label className="text-sm text-gray-500">ID Details</label>
                  <p className="font-medium">
                    {[test.IDType, test.IDNumber].filter(Boolean).join(' — ')}
                  </p>
                </div>
              )}
            </div>

            {/* Alcohol Results */}
            <div className="border-t pt-4 mb-4">
              <h3 className="font-medium text-gray-900 mb-3">Alcohol (BAC)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Initial BAC</label>
                  <p className={`font-medium ${parseFloat(test.BACInitialValue) > 0 ? 'text-red-600 font-bold' : ''}`}>
                    {test.BACInitialValue != null ? `${test.BACInitialValue.toFixed(3)}%` : '-'}
                  </p>
                  {test.BACInitialTime && <p className="text-xs text-gray-400">{test.BACInitialTime}</p>}
                  {parseFloat(test.BACInitialValue) > 0 && (
                    <p className="text-xs text-red-600 font-medium mt-1">⚠️ Non-zero reading</p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-500">Final BAC</label>
                  <p className={`font-medium ${parseFloat(test.BACFinalValue) > 0 ? 'text-red-600 font-bold' : ''}`}>
                    {test.BACFinalValue != null ? `${test.BACFinalValue.toFixed(3)}%` : '-'}
                  </p>
                  {test.BACFinalTime && <p className="text-xs text-gray-400">{test.BACFinalTime}</p>}
                  {parseFloat(test.BACFinalValue) > 0 && (
                    <p className="text-xs text-red-600 font-medium mt-1">⚠️ Non-zero reading</p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-500">Device ID</label>
                  <p className="font-medium">{test.BACDeviceID || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Alcohol Outcome</label>
                  <div className="flex flex-col gap-1">
                    <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getOutcomeBadge(test.FinalBACOutcome)}`}>
                      {test.FinalBACOutcome || 'N/A'}
                    </span>
                    {parseFloat(test.BACInitialValue) > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        ⚠️ Workplace: Any BAC &gt; 0 is prohibited
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Drug Results */}
            <div className="border-t pt-4">
              <h3 className="font-medium text-gray-900 mb-3">Drug Screening</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Oral Result</label>
                  <p className="font-medium">{test.OralResult || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Oral Device ID</label>
                  <p className="font-medium">{test.OralDeviceID || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Urine Result</label>
                  <p className="font-medium">{test.UrineResult || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Urine Sample ID</label>
                  <p className="font-medium">{test.UrineSampleID || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Sent to Lab</label>
                  <p className="font-medium">{test.SampleSentToLab ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Lab Reference</label>
                  <p className="font-medium">{test.LabReference || '-'}</p>
                </div>
                {test.SampleSentToLab && (
                  <div>
                    <label className="text-sm text-gray-500">Lab Request Type</label>
                    <p className="font-medium">{test.LabRequestType === 'gcms' ? 'GC-MS Requested' : 'Specific Test Requested'}</p>
                  </div>
                )}
                {test.SampleSentToLab && test.LabRequestNotes && (
                  <div className="col-span-2">
                    <label className="text-sm text-gray-500">Lab Request Notes</label>
                    <p className="font-medium whitespace-pre-line">{test.LabRequestNotes}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm text-gray-500">Drug Outcome</label>
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${getOutcomeBadge(test.FinalDrugOutcome)}`}>
                    {test.FinalDrugOutcome === 'Confirmed - Pending Review'
                      ? 'Confirmed - Pending HSE Management Review'
                      : (test.FinalDrugOutcome || 'N/A')}
                  </span>
                </div>
              </div>

              {/* Lab/Confirmatory Results */}
              {(test.ConfirmatoryResult || test.MedicationReviewStatus || test.DeclaredMedications) && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Confirmatory Results & Medication Review</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="text-gray-500">Lab Result</label>
                      <p className="font-medium">{test.ConfirmatoryResult || '-'}</p>
                    </div>
                    <div>
                      <label className="text-gray-500">Medication Review</label>
                      <p className="font-medium">{test.MedicationReviewStatus || '-'}</p>
                    </div>
                    {test.DetectedSubstances && (
                      <div>
                        <label className="text-gray-500">Detected Substances</label>
                        <p className="font-medium">{test.DetectedSubstances}</p>
                      </div>
                    )}
                    {test.DeclaredMedications && (
                      <div>
                        <label className="text-gray-500">Declared Medications</label>
                        <p className="font-medium">{test.DeclaredMedications}</p>
                      </div>
                    )}
                    {test.MedicationReviewNotes && (
                      <div className="col-span-2">
                        <label className="text-gray-500">Review Notes</label>
                        <p className="font-medium">{test.MedicationReviewNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Overall Result */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-gray-500">Overall AOD Result</label>
                  {(() => {
                    const result = test.OverallAODResult || computeOverallAODResult(test.FinalDrugOutcome, test.FinalBACOutcome);
                    const color = !result ? 'text-gray-400' : result === 'Negative' ? 'text-green-600' : result.includes('Positive') || result.includes('Inconsistent') ? 'text-red-600' : 'text-amber-600';
                    return <p className={`text-lg font-bold ${color}`}>{result || 'Pending'}</p>;
                  })()}
                </div>
                {isClosed && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Case Closed</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {test.Notes && (
              <div className="border-t pt-4 mt-4">
                <label className="text-sm text-gray-500">Notes</label>
                <p className="text-gray-700 mt-1 whitespace-pre-wrap">{test.Notes}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Edit Mode */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Date</label>
                  <input type="date" value={editForm.testDate} onChange={(e) => setEditForm({...editForm, testDate: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Time</label>
                  <input type="time" value={editForm.testTime} onChange={(e) => setEditForm({...editForm, testTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Type</label>
                  <select value={editForm.testTypeId} onChange={(e) => setEditForm({...editForm, testTypeId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                    {lookups.testTypes.map(t => <option key={t.TestTypeID} value={t.TestTypeID}>{t.Name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clinician</label>
                  <select value={editForm.clinicianId} onChange={(e) => setEditForm({...editForm, clinicianId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                    <option value="">Select...</option>
                    {clinicians.map(c => <option key={c.ClinicianID} value={c.ClinicianID}>{c.Name}</option>)}
                  </select>
                </div>
              </div>

              {/* Alcohol Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-medium text-gray-900">Alcohol (BAC)</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editForm.bacUndertaken} onChange={(e) => setEditForm({...editForm, bacUndertaken: e.target.checked})} className="rounded" />
                    Undertaken
                  </label>
                </div>
                {editForm.bacUndertaken && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Initial BAC</label>
                      <input type="text" inputMode="decimal" value={editForm.bacInitialValue} onChange={(e) => setEditForm({...editForm, bacInitialValue: e.target.value})} onBlur={(e) => formatBAC('bacInitialValue', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="0.000" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Initial Time</label>
                      <input type="time" value={editForm.bacInitialTime} onChange={(e) => setEditForm({...editForm, bacInitialTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Final BAC</label>
                      <input type="text" inputMode="decimal" value={editForm.bacFinalValue} onChange={(e) => setEditForm({...editForm, bacFinalValue: e.target.value})} onBlur={(e) => formatBAC('bacFinalValue', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="0.000" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Final Time</label>
                      <input type="time" value={editForm.bacFinalTime} onChange={(e) => setEditForm({...editForm, bacFinalTime: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Device ID</label>
                      <input type="text" value={editForm.bacDeviceId} onChange={(e) => setEditForm({...editForm, bacDeviceId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                )}
              </div>

              {/* Oral Fluid Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-medium text-gray-900">Oral Fluid</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editForm.oralUndertaken} onChange={(e) => setEditForm({...editForm, oralUndertaken: e.target.checked})} className="rounded" />
                    Undertaken
                  </label>
                </div>
                {editForm.oralUndertaken && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Result</label>
                      <select value={editForm.oralResult} onChange={(e) => setEditForm({...editForm, oralResult: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                        <option value="">Select...</option>
                        <option value="Negative">Negative</option>
                        <option value="Non-Negative">Non-Negative</option>
                        <option value="Invalid">Invalid</option>
                        <option value="Refused">Refused</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Device ID</label>
                      <input type="text" value={editForm.oralDeviceId} onChange={(e) => setEditForm({...editForm, oralDeviceId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                )}
              </div>

              {/* Urine Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-medium text-gray-900">Urine</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editForm.urineUndertaken} onChange={(e) => setEditForm({...editForm, urineUndertaken: e.target.checked})} className="rounded" />
                    Undertaken
                  </label>
                </div>
                {editForm.urineUndertaken && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Result</label>
                      <select value={editForm.urineResult} onChange={(e) => setEditForm({...editForm, urineResult: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                        <option value="">Select...</option>
                        <option value="Negative">Negative</option>
                        <option value="Non-Negative">Non-Negative</option>
                        <option value="Invalid">Invalid</option>
                        <option value="Refused">Refused</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Sample ID</label>
                      <input type="text" value={editForm.urineSampleId} onChange={(e) => setEditForm({...editForm, urineSampleId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                    </div>
                  </div>
                )}
              </div>

              {/* Lab Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-medium text-gray-900">Laboratory</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editForm.sampleSentToLab} onChange={(e) => setEditForm({...editForm, sampleSentToLab: e.target.checked})} className="rounded" />
                    Sample Sent to Lab
                  </label>
                </div>
                {editForm.sampleSentToLab && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Lab Reference</label>
                        <input type="text" value={editForm.labReference} onChange={(e) => setEditForm({...editForm, labReference: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Confirmatory Result</label>
                        <select value={editForm.confirmatoryResult} onChange={(e) => setEditForm({...editForm, confirmatoryResult: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                          <option value="">Pending...</option>
                          <option value="Negative">Negative</option>
                          <option value="Substance Confirmed">Substance Confirmed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Detected Substances</label>
                        <input type="text" value={editForm.detectedSubstances} onChange={(e) => setEditForm({...editForm, detectedSubstances: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="e.g., THC, Amphetamines" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Lab Request Type</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" value="specific" checked={editForm.labRequestType === 'specific'} onChange={() => setEditForm({...editForm, labRequestType: 'specific'})} className="accent-blue-600" />
                          Specific Test Requested
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" value="gcms" checked={editForm.labRequestType === 'gcms'} onChange={() => setEditForm({...editForm, labRequestType: 'gcms'})} className="accent-blue-600" />
                          GC-MS Requested
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        {editForm.labRequestType === 'gcms' ? 'GC-MS Instructions / Notes' : 'Test Requested / Notes'}
                      </label>
                      <textarea value={editForm.labRequestNotes} onChange={(e) => setEditForm({...editForm, labRequestNotes: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {/* Medication Review */}
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">Medication Review</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Declared Medications</label>
                    <input type="text" value={editForm.declaredMedications} onChange={(e) => setEditForm({...editForm, declaredMedications: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Review Status</label>
                    <select value={editForm.medicationReviewStatus} onChange={(e) => setEditForm({...editForm, medicationReviewStatus: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                      <option value="">N/A</option>
                      <option value="Consistent">Consistent</option>
                      <option value="Inconsistent">Inconsistent</option>
                      <option value="Pending Review">Pending Review</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Review Notes</label>
                    <input type="text" value={editForm.medicationReviewNotes} onChange={(e) => setEditForm({...editForm, medicationReviewNotes: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Additional notes..." />
              </div>

              {/* Bottom Save / Cancel */}
              <div className="border-t pt-4 flex gap-3 justify-end">
                <button onClick={cancelEdit} className="flex items-center gap-2 px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button onClick={saveEdit} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400">
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* CoC upload warning */}
      {requireCocUploads && test?.IsNonNegative === 1 && (() => {
        const needsOral  = test.OralResult  === 'Non-Negative' && !attachments.some(a => a.Category === 'Oral Chain of Custody');
        const needsUrine = test.UrineResult === 'Non-Negative' && !attachments.some(a => a.Category === 'Urine Chain of Custody');
        if (!needsOral && !needsUrine) return null;
        return (
          <div key="coc-warn" className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Chain of Custody PDF required</p>
              <p className="text-sm text-amber-700 mt-0.5">This non-negative result requires the following documents to be uploaded:</p>
              <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                {needsOral  && <li>Oral Chain of Custody</li>}
                {needsUrine && <li>Urine Chain of Custody</li>}
              </ul>
            </div>
          </div>
        );
      })()}

      {/* Documents / Attachments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="flex gap-2">
            <label className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm cursor-pointer hover:bg-blue-100 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload Document'}
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => handleFileUpload(e, 'Initial Test Record')} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Upload Categories */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Initial Test Record',    border: 'border-blue-200',   icon: 'text-blue-400',   btn: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
            { label: 'Oral Chain of Custody',  border: 'border-purple-200', icon: 'text-purple-400', btn: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
            { label: 'Urine Chain of Custody', border: 'border-amber-200',  icon: 'text-amber-400',  btn: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
            { label: 'Lab Results',            border: 'border-green-200',  icon: 'text-green-400',  btn: 'bg-green-50 text-green-700 hover:bg-green-100' },
          ].map(({ label, border, icon, btn }) => {
            const count = attachments.filter(a => a.Category === label).length;
            return (
              <div key={label} className={`border-2 border-dashed ${border} rounded-lg p-3 text-center hover:opacity-80 transition-opacity`}>
                <FileText className={`w-7 h-7 ${icon} mx-auto mb-1`} />
                <p className="text-xs font-medium text-gray-700 mb-2 leading-tight">{label}</p>
                <label className={`inline-block px-3 py-1 rounded text-xs cursor-pointer ${btn} ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Upload PDF
                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFileUpload(e, label)} className="hidden" disabled={uploading} />
                </label>
                {count > 0 && <p className="text-xs text-gray-400 mt-1">{count} file{count > 1 ? 's' : ''}</p>}
              </div>
            );
          })}
        </div>

        {/* Attachment List grouped by category */}
        {attachments.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Paperclip className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No documents attached</p>
          </div>
        ) : (
          <div className="divide-y">
            {attachments.map(att => (
              <div key={att.AttachmentID} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-sm">{att.OriginalFileName || att.FileName}</p>
                    <p className="text-xs text-gray-500">{att.Category} • {format(new Date(att.UploadedAt), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={api.getAttachmentDownloadUrl(att.AttachmentID)} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                    <Download className="w-4 h-4" />
                  </a>
                  <button onClick={() => handleDeleteAttachment(att.AttachmentID)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Email Test Report</h3>
              <button onClick={() => setShowEmailModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Sends the full test report (formatted HTML) with all file attachments to the specified address(es).</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To <span className="font-normal text-gray-400">(comma-separate multiple)</span></label>
                <input type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  placeholder="someone@example.com, another@example.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            {emailStatus && (
              <p className={`mt-3 text-sm ${emailStatus.ok ? 'text-green-600' : 'text-red-600'}`}>{emailStatus.msg}</p>
            )}
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button disabled={emailSending || !emailTo.trim()}
                onClick={async () => {
                  setEmailSending(true); setEmailStatus(null);
                  try {
                    const toList = emailTo.split(',').map(e => e.trim()).filter(Boolean);
                    await api.sendTestEmail(id, toList, emailSubject);
                    setEmailStatus({ ok: true, msg: `Sent to ${toList.join(', ')}` });
                  } catch (err) {
                    setEmailStatus({ ok: false, msg: err.message });
                  } finally { setEmailSending(false); }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {emailSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lab Result Modal */}
      {showLabResultModal && (
        <LabResultModal 
          testId={id} 
          onClose={() => setShowLabResultModal(false)} 
          onSave={() => { loadTest(); setShowLabResultModal(false); }} 
        />
      )}
      {/* Hidden print-only section — populated dynamically by handlePrint */}
      <div ref={printSectionRef} className="print-only" />

      <style>{`
        @media print {
          body > * { display: none !important; }
          #root > * { display: none !important; }
          .print-only { display: block !important; }
          .no-print { display: none !important; }
          .pr { font-family: Arial, sans-serif; font-size: 11pt; color: #111; }
          .phead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
          .ptnum { font-size: 18pt; font-weight: bold; }
          .ptdate { font-size: 10pt; color: #555; margin-top: 2px; }
          .presult { font-size: 16pt; font-weight: bold; text-align: right; }
          .ps { margin-bottom: 12px; page-break-inside: avoid; }
          .psh { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 6px; }
          .psc { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
          .pf { display: contents; }
          .pl { font-size: 9pt; color: #666; }
          .pv { font-size: 10pt; font-weight: 600; }
          .pnotes { font-size: 10pt; white-space: pre-wrap; }
          .pah { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin: 14px 0 8px; }
          .pa { page-break-before: always; }
          .pan { font-size: 9pt; color: #555; margin-bottom: 6px; }
          .pac { background: #eee; padding: 1px 5px; border-radius: 3px; font-size: 8pt; }
          .paimg { max-width: 100%; max-height: 240mm; object-fit: contain; display: block; }
          .ppdfs { margin-top: 12px; font-size: 9pt; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>
    </div>
  );
};


export default TestDetail;
