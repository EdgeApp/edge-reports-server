import '../demo.css'

import React from 'react'

interface ApiKeyScreenProps {
  apiKeyMessage: string
  handleApiKeyChange: any
  getAppId: any
}

const ApiKeyScreen: any = (props: ApiKeyScreenProps) => {
  return (
    <>
      <div className="apiKey-message-holder">
        <div className="apiKey-input apiKey-message">{props.apiKeyMessage}</div>
        <div className="apiKey-message">
          <input
            className="apiKey-input apiKey-input-length"
            onChange={e => props.handleApiKeyChange(e)}
          />
          <button className="apiKey-button" onClick={() => props.getAppId()}>
            Use
          </button>
        </div>
      </div>
    </>
  )
}
export default ApiKeyScreen
