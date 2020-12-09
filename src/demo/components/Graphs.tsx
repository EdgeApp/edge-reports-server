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

import Partners from '../partners.json'
import Modal from './Modal'

interface Bucket {
  start: number
  usdValue: number
  numTxs: number
  isoDate: string
  currencyCodes: { [currencyCode: string]: number }
  currencyPairs: { [currencyPair: string]: number }
}

interface Data {
  date: string
  allUsd: number
  allTxs: number
  currencyPairsArray?: Array<[string, number]>
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

interface BarData {
  [start: number]: Data
}

const parseDate = (timestamp: number, timePeriod: string): string => {
  const dateObj = new Date(timestamp * 1000)
  const y = dateObj.getUTCFullYear()
  const m = dateObj.getUTCMonth() + 1
  const d = dateObj.getUTCDate()
  const h = dateObj.getUTCHours()
  if (timePeriod === 'month') {
    return `${y}-${m}`
  } else if (timePeriod === 'day') {
    return `${y}-${m}-${d}`
  } else if (timePeriod === 'hour') {
    return `${y}-${m}-${d}:${h}`
  }
  throw new Error('bad timeperiod')
}

const modalStyle = {
  position: 'absolute' as 'absolute',
  zIndex: 1000,
  left: '0px'
}

const Graphs: any = (props: {
  rawData: AnalyticsResult[]
  timePeriod: string
}) => {
  let modal
  let tooltip = ''
  const [altModal, setModal] = useState(<></>)
  const { rawData, timePeriod } = props

  const bars: JSX.Element[] = []

  const data: BarData = rawData.reduce(
    (prev: BarData, analytics: AnalyticsResult, index: number) => {
      const buckets = analytics.result[timePeriod]
      const graphName =
        analytics.pluginId.charAt(0).toUpperCase() + analytics.pluginId.slice(1)
      bars.push(
        <Bar
          key={index}
          yAxisId="left"
          stackId="a"
          dataKey={graphName}
          barSize={20}
          fill={Partners[analytics.pluginId].color}
          onMouseOver={() => {
            tooltip = graphName
          }}
          onClick={() => {
            setModal(modal)
          }}
          onMouseLeave={() => {
            tooltip = ''
          }}
          animationDuration={0}
        />
      )
      for (let i = 0; i < buckets.length; i++) {
        const { start, usdValue, numTxs, currencyPairs } = buckets[i]
        if (prev[start] == null) {
          prev[start] = {
            date: parseDate(start, timePeriod),
            allUsd: 0,
            allTxs: 0,
            currencyPairs: { ...currencyPairs }
          }
        } else {
          Object.keys(currencyPairs).forEach(currencyPair => {
            if (prev[start].currencyPairs[currencyPair] == null) {
              prev[start].currencyPairs[currencyPair] =
                currencyPairs[currencyPair]
            } else
              prev[start].currencyPairs[currencyPair] +=
                currencyPairs[currencyPair]
          })
        }
        prev[start].allUsd += usdValue
        prev[start].allTxs += numTxs
        prev[start][graphName] = usdValue
        prev[start][`${graphName}NumTxs`] = numTxs
        prev[start][`${graphName}Color`] = Partners[analytics.pluginId].color
      }
      return prev
    },
    {}
  )
  for (const pluginDay in data) {
    const result = data[pluginDay]
    result.currencyPairsArray = Object.entries(result.currencyPairs).sort(
      (a, b) => b[1] - a[1]
    )
  }

  const CustomTooltip = (
    active,
    payload,
    isClosable: boolean = false
  ): JSX.Element => {
    if (active === true) {
      return (
        <Modal
          payload={payload}
          closeModal={() => setModal(<></>)}
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
      <div style={modalStyle}>{altModal}</div>
      <ResponsiveContainer>
        <ComposedChart
          data={Object.values(data)}
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
