import React from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'

interface ApiKeyScreenProps {
  apiKeyMessage: string
  handleApiKeyChange: any
  getAppId: any
}

const ApiKeyScreen: any = (props: ApiKeyScreenProps) => {
  return (
    <ul>
      <li style={styleSheet.apiKeyMessage}>{props.apiKeyMessage}</li>
      <li style={styleSheet.apiKeyUserDiv}>
        <input
          style={styleSheet.apiKeyInput}
          onChange={e => props.handleApiKeyChange(e)}
        />
        <button
          style={styleSheet.apiKeyButton}
          onClick={() => props.getAppId()}
        >
          Use
        </button>
      </li>
    </ul>
  )
}
export default ApiKeyScreen
