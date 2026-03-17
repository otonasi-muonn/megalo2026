const ITEMS = [
  { kind: 'bane', label: 'バネ', src: '/images/bane.png' },
  { kind: 'block', label: 'ブロック', src: '/images/block.png' },
  { kind: 'gool', label: 'ゴール', src: '/images/gool.png' },
  { kind: 'souhuuki', label: '扇風機', src: '/images/souhuuki.png' },
  { kind: 'toge', label: 'トゲ', src: '/images/toge.png' },
] as const

export const ItemPalette = () => {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, kind: string) => {
    event.dataTransfer.setData('item-kind', kind)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="item-palette">
      {ITEMS.map((item) => (
        <div
          key={item.kind}
          className="palette-item"
          draggable
          onDragStart={(event) => handleDragStart(event, item.kind)}
        >
          <img src={item.src} alt={item.label} className="palette-item-image" draggable={false} />
          <span className="palette-item-label">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
