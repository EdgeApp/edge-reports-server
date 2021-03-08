import React from 'react'
import { Redirect, withRouter } from 'react-router-dom'

interface ApiKeyScreenProps {
  apiKeyMessage: string
  handleApiKeyChange: any
  getAppId: any
  appId: string
}

const apiKeyMessage = {
  listStyleType: 'none' as 'none',
  textAlign: 'center' as 'center',
  fontSize: '24px'
}

const apiKeyUserDiv = {
  listStyleType: 'none' as 'none',
  textAlign: 'center' as 'center',
  marginTop: '12px',
  marginRight: '10px'
}

const apiKeyInput = {
  fontSize: '16px',
  width: '270px',
  borderWidth: '1px',
  color: 'black',
  outline: 'none' as 'none'
}

const apiKeyButton = {
  backgroundColor: 'transparent' as 'transparent',
  fontSize: '16px',
  cursor: 'pointer' as 'pointer',
  marginLeft: '20px'
}

const ApiKeyScreen: any = (props: ApiKeyScreenProps) => {
  if (typeof props.appId === 'string' && props.appId.length > 0) {
    return <Redirect to={{ pathname: '/preset' }} />
  }
  return (
    <ul>
      <li style={apiKeyMessage}>{props.apiKeyMessage}</li>
      <li style={apiKeyUserDiv}>
        <input
          style={apiKeyInput}
          onChange={e => props.handleApiKeyChange(e)}
        />
        <button style={apiKeyButton} onClick={() => props.getAppId()}>
          Use
        </button>
      </li>
    </ul>
  )
}
export default withRouter(ApiKeyScreen)
