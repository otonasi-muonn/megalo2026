type StageStatsProps = {
  playCount: number
  clearCount: number
  likeCount: number
  className?: string
}

export const StageStats = ({
  playCount,
  clearCount,
  likeCount,
  className = 'meta-text',
}: StageStatsProps) => (
  <p className={className}>
    play: {playCount} / clear: {clearCount} / like: {likeCount}
  </p>
)
