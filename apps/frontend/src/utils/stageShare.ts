const copyTextWithExecCommand = (text: string): boolean => {
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  textArea.style.top = '0'

  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textArea)
  }
}

export const buildStagePlayPath = (stageId: string): string =>
  `/play/${encodeURIComponent(stageId)}`

export const buildStagePlayUrl = (stageId: string): string =>
  `${window.location.origin}${buildStagePlayPath(stageId)}`

export const copyStagePlayUrl = async (stageId: string): Promise<string> => {
  const stageUrl = buildStagePlayUrl(stageId)

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(stageUrl)
    return stageUrl
  }

  if (!copyTextWithExecCommand(stageUrl)) {
    throw new Error('共有リンクのコピーに失敗しました。')
  }

  return stageUrl
}
