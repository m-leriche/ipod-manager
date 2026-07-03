import { FolderPicker } from "../../atoms/FolderPicker/FolderPicker";
import { useAudioPlayback } from "../../molecules/MiniPlayer/useAudioPlayback";
import { QualityList } from "./QualityList";
import { QualityDetailPanel } from "./QualityDetailPanel";
import { AudioPreviewModal } from "./AudioPreviewModal";
import { useQualityScan } from "./useQualityScan";
import { verdictColor } from "./helpers";

export const QualityAnalyzer = () => {
  const scan = useQualityScan();
  const audio = useAudioPlayback(scan.selectedFile);

  if (scan.phase === "scanning") {
    return <div className="flex-1" />;
  }

  if (scan.phase === "idle") {
    return (
      <>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0 mb-3">
          <FolderPicker label="Folder" path={scan.scanPath || null} onBrowse={scan.browse} />
          {scan.error && <span className="text-danger text-[11px] ml-2">{scan.error}</span>}
        </div>
        <div className="flex-1 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center">
          <div className="text-3xl mb-3 text-text-tertiary">{"♫"}</div>
          <p className="text-xs font-medium mb-1 text-text-secondary">Choose a folder to analyze</p>
          <p className="text-[11px] text-text-tertiary">
            Checks codecs, bitrates, and spectra to flag lossy files and suspect transcodes
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 bg-bg-secondary border border-border rounded-2xl px-5 py-3 shrink-0 mb-3">
        <FolderPicker label="Folder" path={scan.scanPath || null} onBrowse={scan.browse} />
        <button
          onClick={scan.rescan}
          className="px-3 py-1.5 bg-bg-card border border-border text-text-tertiary rounded-lg text-[11px] font-medium shrink-0 hover:text-text-secondary hover:border-border-active transition-all"
        >
          Rescan
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-xs font-medium shrink-0">
          {scan.counts.lossless > 0 && (
            <span className={verdictColor("lossless")}>{scan.counts.lossless} lossless</span>
          )}
          {scan.counts.lossy > 0 && <span className={verdictColor("lossy")}>{scan.counts.lossy} lossy</span>}
          {scan.counts.suspect > 0 && <span className={verdictColor("suspect")}>{scan.counts.suspect} suspect</span>}
        </div>
        {scan.error && <span className="text-danger text-[11px]">{scan.error}</span>}
      </div>

      <div className="flex-1 flex gap-3 min-h-0">
        <QualityList groups={scan.groups} selectedFile={scan.selectedFile} onSelectFile={scan.setSelectedFile} />
        {scan.selectedData && (
          <QualityDetailPanel
            file={scan.selectedData}
            spectrogramCache={scan.spectrograms}
            onSpectrogramLoaded={scan.handleSpectrogramLoaded}
            waveformCache={scan.waveforms}
            onWaveformLoaded={scan.handleWaveformLoaded}
            onOpenPreview={scan.openPreview}
            audio={audio}
          />
        )}
      </div>

      {scan.previewModal &&
        (() => {
          const modalFile = scan.files.find((f) => f.file_path === scan.previewModal!.filePath) ?? null;
          return modalFile ? (
            <AudioPreviewModal
              type={scan.previewModal.type}
              file={modalFile}
              spectrogramBase64={scan.spectrograms[scan.previewModal.filePath]}
              waveformResult={scan.waveforms[scan.previewModal.filePath]}
              audio={audio}
              onClose={() => scan.setPreviewModal(null)}
            />
          ) : null;
        })()}
    </>
  );
};
