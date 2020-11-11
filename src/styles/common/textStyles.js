export const body = {
  margin: 0,
  padding: 0,
  height: '100%'
}

export const row = {
  width: '100%',
  height: '100%',
  display: 'table',
  tableLayout: 'fixed'
}

export const column = {
  minHeight: '100%',
  display: 'table-cell'
}

export const sidebar = {
  ...column,
  background: 'linear-gradient(90deg, #0C446A 0%, #0D2145 100%)',
  width: '200px'
}

export const logoStyle = {
  marginTop: '26px',
  marginLeft: '26px',
  marginBottom: '10px',
  height: '28px',
  width: '28px'
}

export const calendarStyle = {
  position: 'absolute',
  top: '-3px',
  left: '55px',
  height: '24px',
  width: '24px'
}

export const graphs = {
  ...column,
  verticalAlign: 'top',
  width: '100%'
}

export const commonFont = {
  fontStyle: 'normal',
  fontWeight: 'normal'
}

export const list = {
  ...commonFont,
  listStyleType: 'none',
  textAlign: 'center'
}

export const titleText = {
  ...commonFont,
  marginLeft: '26px',
  color: 'white',
  fontSize: '24px'
}

export const loadingMessage = {
  ...commonFont,
  textAlign: 'center',
  fontSize: '18px',
  marginTop: '16px',
  color: 'grey'
}

export const sideBarLoadingMessage = {
  ...commonFont,
  textAlign: 'center',
  marginTop: '29px'
}

export const apiKeyMessage = {
  ...list,
  fontSize: '24px'
}

export const apiKeyUserDiv = {
  ...list,
  marginTop: '12px',
  marginRight: '12px'
}

export const input = {
  ...commonFont,
  marginLeft: '-2px',
  fontSize: '16px',
  backgroundColor: 'transparent'
}

export const dateInput = {
  ...input,
  border: 'none',
  color: 'white',
  width: '100px'
}

export const apiKeyInput = {
  ...input,
  width: '270px',
  borderWidth: '1px',
  color: 'black'
}

export const divider = {
  marginTop: '15px',
  width: '72%',
  borderTop: '.5px solid white'
}

export const button = {
  ...commonFont,
  overflow: 'hidden',
  outline: 'none',
  backgroundColor: 'transparent',
  fontSize: '16px',
  cursor: 'pointer'
}

export const closeModalButton = {
  position: 'absolute',
  top: '-1px',
  left: '178px',
  cursor: 'pointer'
}

export const timePeriodButton = {
  ...button,
  color: 'black',
  marginRight: '20px',
  border: 'none'
}

export const apiKeyButton = {
  ...button,
  color: 'black',
  border: '1px solid black',
  marginLeft: '20px'
}

export const mainButton = {
  ...button,
  marginTop: '12px',
  textAlign: 'left',
  marginLeft: '68px',
  marginBottom: '12px',
  color: 'white',
  border: '1px solid white'
}

export const regularButton = {
  ...button,
  width: '100%',
  paddingTop: '12px',
  textAlign: 'left',
  marginLeft: '20px',
  color: 'white',
  border: 'none'
}

export const sideBarContainer = {
  marginTop: '12px'
}

export const calendarContainer = {
  position: 'relative',
  marginTop: '10px',
  marginLeft: '26px',
  color: 'white'
}

export const dateContainer = {
  marginLeft: '26px'
}

export const exchangeTypeContainer = {
  position: 'relative'
}

export const calendarText = {
  ...commonFont,
  marginTop: '20px',
  fontSize: '16px',
  color: 'white'
}

export const apiKeyDivHolder = {
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'column'
}

export const largeGraphHolder = {
  height: '800px'
}

export const smallGraphHolder = {
  height: '400px'
}

export const smallLegendAndGraphHolder = {
  width: '50%',
  float: 'left'
}

export const timePeriodHolder = {
  marginLeft: '14px',
  marginTop: '16px'
}

export const legendHolder = {
  width: '95%',
  marginTop: '10px',
  marginLeft: '24px',
  display: 'inline-flex',
  flexWrap: 'wrap'
}

export const currencyPairHolder = {
  display: 'flex',
  flexDirection: 'row'
}

export const currencyPairName = {
  width: '57%'
}

export const currencyPairUsd = {
  width: '43%'
}

export const modalTotalUsd = {
  marginTop: '16px'
}

export const modalCurrencyPairs = {
  marginTop: '10px'
}

export const legend = {
  ...commonFont,
  marginTop: '-6px',
  marginLeft: '8px',
  fontSize: '18px',
  lineHeight: '30px'
}

export const legendKeys = {
  marginTop: '2px',
  display: 'flex',
  flexDirection: 'row'
}

export const modal = {
  position: 'absolute',
  zIndex: 1000,
  left: '0px'
}
