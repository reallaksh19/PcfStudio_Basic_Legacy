import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useAppContext } from '../../store/AppContext';

export const SideInspector = () => {
  const { state: appState, dispatch } = useAppContext();
  const selectedElementId = useStore(state => state.selectedElementId);
  const multiSelectedIds = useStore(state => state.multiSelectedIds);
  const dataTable = useStore(state => state.dataTable);
  const setSelected = useStore(state => state.setSelected);
  const clearMultiSelect = useStore(state => state.clearMultiSelect);
  const showSideInspector = useStore(state => state.showSideInspector);
  const pushHistory = useStore(state => state.pushHistory);

  const [formData, setFormData] = useState(null);
  const [isChanged, setIsChanged] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeIds = (multiSelectedIds || []).length > 0 ? multiSelectedIds : (selectedElementId ? [selectedElementId] : []);
  const isMulti = (activeIds || []).length > 1;

  useEffect(() => {
    if ((activeIds || []).length > 0 && showSideInspector) {
      const elements = (activeIds || []).map(id => dataTable.find(r => r._rowIndex === id)).filter(Boolean);

      if (elements.length === 0 || elements.every(el => el.type === 'SUPPORT')) {
          setFormData(null);
          return;
      }

      if (isMulti) {
        // Multi-select mode: show empty strings for conflicting values, or common values if they match
        const commonData = { _isMulti: true, _rowIndices: activeIds };
        const fields = ['bore', 'CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10', 'CA97', 'CA98', 'PIPING_CLASS', 'RATING', 'LINENO_KEY', 'skey', 'pipelineRef'];

        fields.forEach(f => {
            const firstVal = elements[0][f];
            const allMatch = elements.every(el => el[f] === firstVal);
            commonData[f] = allMatch ? (firstVal || '') : '';
        });

        setFormData(commonData);
      } else {
        const el = elements[0];
        setFormData({
          ep1: el.ep1 ? { ...el.ep1 } : null,
          ep2: el.ep2 ? { ...el.ep2 } : null,
          cp: el.cp ? { ...el.cp } : null,
          bp: el.bp ? { ...el.bp } : null,
          bore: el.bore || '',
          CA1: el.CA1 || '',
          CA2: el.CA2 || '',
          CA3: el.CA3 || '',
          CA4: el.CA4 || '',
          CA5: el.CA5 || '',
          CA6: el.CA6 || '',
          CA7: el.CA7 || '',
          CA8: el.CA8 || '',
          CA9: el.CA9 || '',
          CA10: el.CA10 || '',
          CA97: el.CA97 || '',
          CA98: el.CA98 || '',
          PIPING_CLASS: el.PIPING_CLASS || '',
          RATING: el.RATING || '',
          LINENO_KEY: el.LINENO_KEY || '',
          skey: el.skey || '',
          pipelineRef: el.pipelineRef || '',
          type: el.type || '',
          _rowIndex: el._rowIndex
        });
      }
      setIsChanged(false);
    } else {
      setFormData(null);
    }
  }, [selectedElementId, multiSelectedIds, dataTable, showSideInspector]);

  const handleChange = (field, subfield, value) => {
    setFormData(prev => {
      const updated = { ...prev };
      if (subfield) {
        updated[field] = { ...updated[field], [subfield]: parseFloat(value) || value };
      } else {
        updated[field] = value;
      }
      return updated;
    });
    setIsChanged(true);
  };

  const handleApply = () => {
    if (!formData) return;

    pushHistory(isMulti ? 'Bulk Inspector Edit' : 'Inspector Edit');

    let updatedTable = [...dataTable];

    if (isMulti) {
        // Apply only changed fields to all selected elements
        // In this simple version, applying overwrites the fields on all selected items
        const fieldsToUpdate = ['bore', 'CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10', 'CA97', 'CA98', 'PIPING_CLASS', 'RATING', 'LINENO_KEY', 'skey', 'pipelineRef'];

        formData._rowIndices.forEach(idx => {
            const tableIdx = updatedTable.findIndex(r => r._rowIndex === idx);
            if (tableIdx !== -1) {
                const updatedRow = { ...updatedTable[tableIdx] };
                fieldsToUpdate.forEach(f => {
                    if (formData[f] !== '') updatedRow[f] = formData[f];
                });
                updatedTable[tableIdx] = updatedRow;
                dispatch({ type: 'UPDATE_STAGE2_ROW_COORDS', payload: { rowIndex: idx, coords: updatedRow } });
            }
        });

        dispatch({ type: "ADD_LOG", payload: { stage: "INSPECTOR", type: "Applied/Fix", message: `Updated properties for ${formData._rowIndices.length} rows.` } });
    } else {
        const tableIdx = updatedTable.findIndex(r => r._rowIndex === formData._rowIndex);
        if (tableIdx !== -1) {
            updatedTable[tableIdx] = { ...updatedTable[tableIdx], ...formData };
            dispatch({ type: 'UPDATE_STAGE2_ROW_COORDS', payload: { rowIndex: formData._rowIndex, coords: formData } });
        }
        dispatch({ type: "ADD_LOG", payload: { stage: "INSPECTOR", type: "Applied/Fix", message: `Updated properties for row ${formData._rowIndex}.` } });
    }

    useStore.getState().setDataTable(updatedTable);
    setIsChanged(false);
  };

  const handleZoomToSelection = () => {
    if (!formData) return;

    if (isMulti) {
        window.dispatchEvent(new CustomEvent('canvas-auto-center'));
        return;
    }

    const { ep1, ep2 } = formData;
    if (!ep1 && !ep2) return;

    let midX, midY, midZ, distance;

    if (ep1 && ep2) {
        midX = (ep1.x + ep2.x) / 2;
        midY = (ep1.y + ep2.y) / 2;
        midZ = (ep1.z + ep2.z) / 2;

        const dx = ep1.x - ep2.x;
        const dy = ep1.y - ep2.y;
        const dz = ep1.z - ep2.z;
        distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    } else {
        const pt = ep1 || ep2;
        midX = pt.x;
        midY = pt.y;
        midZ = pt.z;
        distance = 1000;
    }

    if (distance < 500) distance = 1000;
    window.dispatchEvent(new CustomEvent('canvas-focus-point', { detail: { x: midX, y: midY, z: midZ, dist: distance } }));
  };

  const handleClose = () => {
      setSelected(null);
      clearMultiSelect();
  };

  // Formalized State Machine states: 'HIDDEN', 'SINGLE', 'MULTI'
  const panelState = React.useMemo(() => {
      if (!showSideInspector || !formData) return 'HIDDEN';
      if (formData._isMulti) return 'MULTI';
      return 'SINGLE';
  }, [showSideInspector, formData]);

  if (panelState === 'HIDDEN') return null;

  return (
    <div data-testid="side-inspector-panel" data-panel-state={panelState} className="w-72 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[calc(100vh-10rem)] shrink-0">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-800 p-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <button data-testid="side-inspector-toggle" onClick={() => setIsCollapsed(!isCollapsed)} className="text-red-500 hover:text-red-400 text-xs">
            {isCollapsed ? '▶' : '▼'}
          </button>
          {formData._isMulti ? (
              <span className="text-xs font-bold text-slate-100 bg-purple-600 px-2 py-0.5 rounded uppercase">MULTI-EDIT</span>
          ) : (
              <span className="text-xs font-bold text-slate-100 bg-blue-600 px-2 py-0.5 rounded uppercase">{formData.type}</span>
          )}
          <span className="text-slate-400 text-xs">
              {formData._isMulti ? `${formData._rowIndices?.length || 0} Items` : `Row ${formData._rowIndex}`}
          </span>
        </div>
        <button onClick={handleClose} className="text-slate-400 hover:text-white" title="Deselect">
          ✕
        </button>
      </div>

      {!isCollapsed && (
        <>
      {/* Body */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {/* Actions */}
        <div className="flex justify-between gap-2">
            <button
                onClick={handleZoomToSelection}
                className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs py-1.5 rounded transition"
            >
                🔍 Zoom to Selection
            </button>
        </div>

        {/* Attributes */}
        <div className="space-y-2">
          <h3 className="text-slate-300 text-sm font-semibold border-b border-slate-700 pb-1">
              {formData._isMulti ? 'Common Attributes' : 'Attributes'}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Bore</label>
              <input type="number" value={formData.bore} onChange={(e) => handleChange('bore', null, e.target.value)} placeholder={formData._isMulti ? 'Multiple values...' : ''} className="bg-slate-950 text-slate-200 text-xs p-1 rounded border border-slate-700" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Pipeline Ref</label>
              <input type="text" value={formData.pipelineRef} onChange={(e) => handleChange('pipelineRef', null, e.target.value)} placeholder={formData._isMulti ? 'Multiple values...' : ''} className="bg-slate-950 text-slate-200 text-xs p-1 rounded border border-slate-700" />
            </div>
            {['skey', 'PIPING_CLASS', 'RATING', 'LINENO_KEY'].map(attr => (
              <div key={attr} className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 truncate" title={attr}>{attr}</label>
                <input type="text" value={formData[attr]} onChange={(e) => handleChange(attr, null, e.target.value)} placeholder={formData._isMulti ? 'Multiple values...' : ''} className="bg-slate-950 text-slate-200 text-xs p-1 rounded border border-slate-700" />
              </div>
            ))}
            {['CA97', 'CA98', 'CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10'].map(attr => (
              <div key={attr} className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">{attr}</label>
                <input type="text" value={formData[attr]} onChange={(e) => handleChange(attr, null, e.target.value)} placeholder={formData._isMulti ? 'Multiple values...' : ''} className="bg-slate-950 text-slate-200 text-xs p-1 rounded border border-slate-700" />
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-800 border-t border-slate-700 flex justify-end">
        <button
          onClick={handleApply}
          disabled={!isChanged}
          className={`px-4 py-1.5 rounded text-sm font-medium transition ${isChanged ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
        >
          {isChanged ? 'Apply Changes' : 'Applied'}
        </button>
      </div>
        </>
      )}
    </div>
  );
};
