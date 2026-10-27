import { Icon } from './Icon';

interface HeaderProps {
  folderName: string | null;
  canPickFolder: boolean;
  onChooseFolder: () => void;
}

export function Header({ folderName, canPickFolder, onChooseFolder }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="pack" size={22} />
        </span>
        <div className="brand-text">
          <h1>ShoeBox</h1>
          <p>Local-first sprite toolbox for game developers</p>
        </div>
      </div>

      <div className="header-actions">
        <div className="output-pill" title="Where results are written">
          <span className={`dot ${folderName ? 'on' : ''}`} />
          <span>{folderName ? `Saving to ${folderName}` : 'ZIP download output'}</span>
        </div>
        <button type="button" className="btn ghost" onClick={onChooseFolder}>
          <Icon name="folder" size={16} />
          {folderName ? 'Change folder' : 'Choose folder'}
        </button>
        {!canPickFolder && (
          <span className="header-hint" title="Folder access requires a Chromium-based browser">
            Folder picker unavailable
          </span>
        )}
      </div>
    </header>
  );
}
