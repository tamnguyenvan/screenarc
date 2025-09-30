import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../store/editorStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PresetPreview } from './PresetPreview';
import { Preset } from '../../types/store';
import { cn } from '../../lib/utils';
import {
  Plus, Trash2, Check, Lock,
  RectangleHorizontal
} from 'lucide-react';
import { PaddingIcon, BorderThicknessIcon, ShadowIcon, CornerRadiusIcon } from '../ui/icons';


interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PresetModal({ isOpen, onClose }: PresetModalProps) {
  const {
    presets, activePresetId,
    applyPreset, saveCurrentStyleAsPreset, deletePreset, updatePresetName } = useEditorStore(
    useShallow(state => ({
      presets: state.presets,
      activePresetId: state.activePresetId,
      applyPreset: state.applyPreset,
      saveCurrentStyleAsPreset: state.saveCurrentStyleAsPreset,
      deletePreset: state.deletePreset,
      updatePresetName: state.updatePresetName,
    }))
  );
  
  // Internal state of the modal to manage the currently selected preset for preview
  const [previewId, setPreviewId] = useState<string | null>(activePresetId);
  const [newPresetName, setNewPresetName] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  // Reset previewId when modal is opened or active preset changes
  useEffect(() => {
    if (isOpen) {
      setPreviewId(activePresetId);
    }
  }, [isOpen, activePresetId]);
  
  // Find the default preset
  const defaultPreset = Object.values(presets).find(p => p.isDefault);
  
  // When active ID becomes null, set preview to default
  useEffect(() => {
    if (isOpen && !activePresetId && defaultPreset) {
      setPreviewId(defaultPreset.id);
    }
  }, [isOpen, activePresetId, defaultPreset]);

  if (!isOpen) return null;

  const presetList = Object.values(presets);
  const previewPreset = previewId ? presets[previewId] : (defaultPreset || null);

  const handleSaveNew = () => {
    if (newPresetName.trim()) {
      saveCurrentStyleAsPreset(newPresetName.trim());
      setNewPresetName('');
    }
  };

  const handleDoubleClick = (preset: Preset) => {
    if (!preset.isDefault) {
      setEditingId(preset.id);
      setEditingName(preset.name);
    }
  };

  const handleRename = () => {
    if (editingId && editingName.trim()) {
      updatePresetName(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };


  
  const handleSelect = () => {
    if (previewId) {
      applyPreset(previewId);
      onClose();
    }
  };
  
  const handleDelete = (idToDelete: string) => {
    deletePreset(idToDelete);
    // If the deleted preset was being previewed, reset preview to default
    if (previewId === idToDelete) {
      setPreviewId(defaultPreset?.id || null);
    }
  };

  return (
    <div className="modal-backdrop z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="card-clean w-full max-w-4xl h-[80vh] max-h-[700px] flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground">Manage Presets</h2>
          <p className="text-sm text-muted-foreground">Select, create, or delete your frame style presets.</p>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Left Column: Preset List */}
          <div className="w-1/3 border-r border-border p-4 flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {presetList.map(p =>
                editingId === p.id ? (
                  <div key={p.id} className="p-1.5">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') cancelRename();
                      }}
                      autoFocus
                      className="h-9"
                    />
                  </div>
                ) : (
                  <button
                    key={p.id}
                    onClick={() => setPreviewId(p.id)}
                    onDoubleClick={() => handleDoubleClick(p)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors",
                      previewId === p.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent/50'
                    )}
                  >
                    <span className="font-medium flex items-center gap-2">
                      {p.name}
                      {p.isDefault && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </span>
                    {activePresetId === p.id && <Check className="w-4 h-4 text-primary" />}
                  </button>
                )
              )}
            </div>
            <div className="pt-4 border-t border-border mt-2">
              <div className="flex items-center gap-2">
                <Input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="New preset name..."
                  className="h-9"
                />
                <Button size="sm" onClick={handleSaveNew} disabled={!newPresetName.trim()}>
                  <Plus className="w-4 h-4 mr-1"/> Save
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Preview */}
          <div className="w-2/3 p-6 bg-muted/30 flex flex-col">
            {previewPreset ? (
              <div className="w-full flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h3 className="text-lg text-foreground font-semibold flex items-center gap-2">
                    {previewPreset.name}
                    {previewPreset.isDefault && <Lock className="w-4 h-4 text-muted-foreground" />}
                  </h3>
                  {!previewPreset.isDefault && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(previewPreset.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2"/> Delete
                    </Button>
                  )}
                </div>
                
                <div className="flex-1 flex items-center justify-center min-h-0">
                  <PresetPreview 
                    styles={previewPreset.styles}
                    aspectRatio={previewPreset.aspectRatio}
                    isWebcamVisible={previewPreset.isWebcamVisible}
                    webcamPosition={previewPreset.webcamPosition}
                    webcamStyles={previewPreset.webcamStyles}
                  />
                </div>

                <div className="flex-shrink-0 flex items-center justify-center flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-border/30">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RectangleHorizontal className="w-3.5 h-3.5" />
                    <span>{previewPreset.aspectRatio}</span>
                  </div>
                   <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PaddingIcon className="w-3.5 h-3.5" />
                    <span>{previewPreset.styles.padding}%</span>
                  </div>
                   <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CornerRadiusIcon className="w-3.5 h-3.5" />
                    <span>{previewPreset.styles.borderRadius}px</span>
                  </div>
                   <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShadowIcon className="w-3.5 h-3.5" />
                    <span>{previewPreset.styles.shadow}px</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BorderThicknessIcon className="w-3.5 h-3.5" />
                    <span>{previewPreset.styles.borderWidth}px</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground">Select a preset to preview</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSelect} disabled={!previewId}>Select Preset</Button>
        </div>
      </div>
    </div>
  );
}