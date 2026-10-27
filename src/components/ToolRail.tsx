import { tools, toolGroups } from '../tools/registry';
import { Icon } from './Icon';

interface ToolRailProps {
  activeId: string;
  onSelect: (id: string) => void;
}

export function ToolRail({ activeId, onSelect }: ToolRailProps) {
  return (
    <nav className="rail panel" aria-label="Tools">
      {toolGroups.map((group) => (
        <div className="rail-group" key={group}>
          <span className="rail-title">{group}</span>
          {tools
            .map((tool, index) => ({ tool, index }))
            .filter(({ tool }) => tool.group === group)
            .map(({ tool, index }) => (
              <button
                type="button"
                key={tool.id}
                className={`rail-item ${tool.id === activeId ? 'active' : ''}`}
                onClick={() => onSelect(tool.id)}
                aria-current={tool.id === activeId}
              >
                <span className="rail-icon">
                  <Icon name={tool.icon} size={18} />
                </span>
                <span className="rail-label">{tool.label}</span>
                <kbd>{index + 1}</kbd>
              </button>
            ))}
        </div>
      ))}

      <div className="rail-footer">
        <span className="rail-title">Roadmap</span>
        <ul className="rail-soon">
          <li>Multi-page atlases</li>
          <li>Font kerning editor</li>
          <li>Worker offload</li>
        </ul>
        <p className="rail-note">Everything runs locally. No uploads.</p>
      </div>
    </nav>
  );
}
