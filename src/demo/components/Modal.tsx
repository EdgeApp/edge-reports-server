import React from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'

interface ModalProps {
  closeModal: any
  payload: any
  tooltip: string
  isSinglePartner: boolean
  isClosable: boolean
}
const verticalBlockHolder = {
  width: '198px',
  display: 'flex' as 'flex',
  flexDirection: 'column' as 'column',
  borderRadius: '2px',
  backgroundColor: 'rgb(255,255,255)',
  border: '1px solid #BFBFBF'
}
const horizontalBlockHolder = {
  flexDirection: 'row' as 'row'
}

const styleTwo = {
  padding: '10px',
  paddingTop: '10px',
  backgroundColor: 'rgb(255,255,255)',
  fontFamily: 'Quicksand',
  fontStyle: 'normal' as 'normal',
  fontWeight: 'normal' as 'normal',
  fontSize: '14px'
}

const closeModalButton = {
  textAlign: 'right' as 'right',
  cursor: 'pointer',
  fontSize: '10px'
}

const Modal: any = (props: ModalProps) => {
  const { closeModal, payload, tooltip, isSinglePartner, isClosable } = props
  if (tooltip === '') return null
  const bar = payload.find(({ dataKey }) => dataKey === tooltip)
  const currencyPairs: JSX.Element[] = bar.payload.currencyPairsArray
    .map(([key, value], index) => (
      <div key={index} style={styleSheet.currencyPairHolder}>
        <div style={styleSheet.currencyPairName}>{`${key}:`}</div>
        <div style={styleSheet.currencyPairUsd}>{`$${value.toFixed(2)}`}</div>
      </div>
    ))
    .slice(0, 15)
  let modalStyle = styleTwo
  let closable: JSX.Element | null = null
  if (isClosable === true) {
    modalStyle = { ...styleTwo, paddingTop: '2px' }
    closable = (
      <span style={closeModalButton} onClick={closeModal}>
        ❌
      </span>
    )
  }
  const total = !isSinglePartner ? (
    <>
      <div
        style={styleSheet.modalTotalUsd}
      >{`Total USD: $${bar.payload.allUsd.toFixed(2)}`}</div>
      <div>{`Total Transactions: ${bar.payload.allTxs}`}</div>
    </>
  ) : null
  return (
    <div style={verticalBlockHolder}>
      {closable}
      <div style={horizontalBlockHolder}>
        <div style={modalStyle}>
          <div>{`${tooltip} USD: $${bar.payload[tooltip].toFixed(2)}`}</div>
          <div>{`${tooltip} Transactions: ${
            bar.payload[`${tooltip}NumTxs`]
          }`}</div>
          <div>{`Date: ${bar.payload.date}`}</div>
          <hr style={styleSheet.divider} />
          {total}
          <div style={styleSheet.modalCurrencyPairs}>{currencyPairs}</div>
        </div>
      </div>
    </div>
  )
}
export default Modal
