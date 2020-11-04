import React, { useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import * as styleSheet from '../../styles/common/textStyles.js'
import Modal from './Modal'

interface Bucket {
  start: number
  usdValue: number
  numTxs: number
  isoDate: string
  currencyCodes: { [currencyCode: string]: number }
  currencyPairs: { [currencyPair: string]: number }
}

interface AnalyticsResult {
  result: {
    hour: Bucket[]
    day: Bucket[]
    month: Bucket[]
    numAllTxs: number
  }
  app: string
  pluginId: string
  start: number
  end: number
}

const Graphs: any = (props: {
  rawData: AnalyticsResult[]
  timePeriod: string
  colors: string[]
}) => {
  let modal
  const [tooltip, setTooltip] = useState('')
  const [altModal, setModal] = useState(<></>)
  const { rawData, timePeriod } = props
  const keys = props.rawData.map(analyticsResult => {
    return (
      analyticsResult.pluginId.charAt(0).toUpperCase() +
      analyticsResult.pluginId.slice(1)
    )
  })
  const colors = {}
  for (let i = 0; i < rawData.length; i++) {
    colors[keys[i]] = props.colors[i]
  }

  const data = rawData[0].result[timePeriod].map((bucket: Bucket, index) => {
    const dateObj = new Date(bucket.start * 1000)
    const y = dateObj.getUTCFullYear()
    const m = dateObj.getUTCMonth() + 1
    const d = dateObj.getUTCDate()
    const h = dateObj.getUTCHours()
    let date
    if (timePeriod === 'month') {
      date = `${y}-${m}`
    } else if (timePeriod === 'day') {
      date = `${y}-${m}-${d}`
    } else {
      date = `${y}-${m}-${d}:${h}`
    }
    const allCurrencyPairs: { [currencyPair: string]: number } = {}
    for (const bucket of rawData) {
      const { currencyPairs } = bucket.result[timePeriod][index]
      for (const key in currencyPairs) {
        const value = currencyPairs[key]
        if (typeof value === 'number') {
          if (allCurrencyPairs[key] == null) {
            allCurrencyPairs[key] = value
            continue
          }
          allCurrencyPairs[key] += value
        }
      }
    }
    const currencyPairArray = Object.entries(allCurrencyPairs).sort(
      (a, b) => b[1] - a[1]
    )
    return { date, allUsd: 0, allTxs: 0, currencyPairs: currencyPairArray }
  })
  for (let i = 0; i < rawData.length; i++) {
    const analytic = rawData[i]
    const txData = analytic.result[timePeriod]
    for (let j = 0; j < txData.length; j++) {
      const { usdValue, numTxs } = txData[j]
      const graphName =
        analytic.pluginId.charAt(0).toUpperCase() + analytic.pluginId.slice(1)
      data[j].allUsd += usdValue
      data[j][graphName] = usdValue
      data[j].allTxs += numTxs
      data[j][`${graphName}NumTxs`] = numTxs
      data[j][`${graphName}Color`] = props.colors[i]
    }
  }

  const bars = rawData.map((obj, index) => {
    const graphName =
      obj.pluginId.charAt(0).toUpperCase() + obj.pluginId.slice(1)
    return (
      <Bar
        key={index}
        yAxisId="left"
        stackId="a"
        dataKey={graphName}
        barSize={20}
        fill={data[0][`${graphName}Color`]}
        onMouseOver={() => {
          setTooltip(graphName)
        }}
        onClick={() => {
          setModal(modal)
        }}
        onMouseLeave={() => {
          setTooltip('')
        }}
        animationDuration={0}
      />
    )
  })

  const CustomTooltip = (
    active,
    payload,
    isClosable: boolean = false
  ): JSX.Element => {
    if (active === true) {
      return (
        <Modal
          payload={payload}
          setModal={setModal}
          tooltip={tooltip}
          isClosable={isClosable}
          isSinglePartner={rawData.length === 1}
        />
      )
    }
    return <></>
  }

  return (
    <>
      <div style={styleSheet.modal}>{altModal}</div>
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20
          }}
          animationDuration={0}
        >
          <CartesianGrid stroke="#f5f5f5" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke="#000000" />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#000000"
            allowDecimals={false}
          />
          {/* @ts-ignore */}
          <Tooltip
            animationDuration={0}
            content={({ active, payload }) => {
              modal = CustomTooltip(active, payload, true)
              return CustomTooltip(active, payload)
            }}
          />
          {bars}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="allTxs"
            dot={false}
            stroke="#000000"
            animationDuration={0}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}
export default Graphs
