import eachQuarterOfInterval from 'date-fns/eachQuarterOfInterval'
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
  if (timePeriod === 'month' || timePeriod === 'quarter') {
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
      let buckets: Bucket[] = []
      if (timePeriod !== 'quarter') buckets = analytics.result[timePeriod]
      else {
        const timezoneOffsetStart =
          new Date(analytics.start).getTimezoneOffset() * 60 * 1000
        const timezoneOffsetEnd =
          new Date(analytics.end).getTimezoneOffset() * 60 * 1000

        const quarterIntervals = eachQuarterOfInterval({
          start: new Date(analytics.start * 1000 + timezoneOffsetStart),
          end: new Date(analytics.end * 1000 + timezoneOffsetEnd)
        })
        buckets = quarterIntervals.map(date => {
          const timezoneOffset = date.getTimezoneOffset() * 60 * 1000
          const realTimestamp = date.getTime() - timezoneOffset
          return {
            start: realTimestamp / 1000,
            usdValue: 0,
            numTxs: 0,
            isoDate: new Date(realTimestamp).toISOString(),
            currencyCodes: {},
            currencyPairs: {}
          }
        })
        let i = 0
        let position = 0
        while (position < analytics.result.month.length) {
          if (i + 1 < buckets.length) {
            if (
              analytics.result.month[position].start >= buckets[i + 1].start
            ) {
              i++
              continue
            }
          }
          buckets[i].usdValue += analytics.result.month[position].usdValue
          buckets[i].numTxs += analytics.result.month[position].numTxs
          for (const currencyPair in analytics.result.month[position]
            .currencyPairs) {
            if (buckets[i].currencyPairs[currencyPair] == null)
              buckets[i].currencyPairs[currencyPair] =
                analytics.result.month[position].currencyPairs[currencyPair]
          }
          for (const currencyCode in analytics.result.month[position]
            .currencyCodes) {
            if (buckets[i].currencyCodes[currencyCode] == null)
              buckets[i].currencyCodes[currencyCode] =
                analytics.result.month[position].currencyCodes[currencyCode]
          }
          position++
        }
      }
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
