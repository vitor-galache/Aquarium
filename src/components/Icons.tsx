/** Ícones de traço do explorador; herdam a cor do texto (`currentColor`). */
type Props = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  "aria-hidden": true,
} as const;

const FOLDER_PATH =
  "M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z";
const FILE_PATH =
  "M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z";

export const FolderIcon = ({ className, open }: Props & { open?: boolean }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    {...base}
    className={className}
  >
    <path
      d={FOLDER_PATH}
      fill={open ? "currentColor" : "none"}
      fillOpacity={0.18}
    />
  </svg>
);

export const FileIcon = ({ className }: Props) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    {...base}
    className={className}
  >
    <path d={FILE_PATH} />
    <path d="M9 1.5v4h4" />
  </svg>
);

export const NewFileIcon = ({ className }: Props) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    {...base}
    strokeWidth={1.4}
    className={className}
  >
    <path d={FILE_PATH} />
    <path d="M8 7.5v4M6 9.5h4" />
  </svg>
);

export const CollapseIcon = ({ className }: Props) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    {...base}
    strokeWidth={1.4}
    className={className}
  >
    <path d="M5 3.5 8 6.5l3-3M5 12.5 8 9.5l3 3" />
  </svg>
);

export const ChevronIcon = ({ className }: Props) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    {...base}
    strokeWidth={1.5}
    className={className}
  >
    <path d="M3.5 2 6.5 5l-3 3" />
  </svg>
);

export const UpDownIcon = ({ className }: Props) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    {...base}
    strokeWidth={1.4}
    className={className}
  >
    <path d="M3.5 4.5 6 2l2.5 2.5M3.5 7.5 6 10l2.5-2.5" />
  </svg>
);

export const GearIcon = ({ className }: Props) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    {...base}
    className={className}
  >
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </svg>
);

export const SearchIcon = ({ className }: Props) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    {...base}
    strokeWidth={1.5}
    className={className}
  >
    <circle cx="7" cy="7" r="4.8" />
    <path d="m10.5 10.5 3.5 3.5" />
  </svg>
);
