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

import { AnalyticsResult, Bucket } from '../../types'
import { addObject, createQuarterBuckets, sevenDayDataMerge } from '../clientUtil'
import Partners from '../partners'
import Modal from './Modal'

export interface Data {
  date: string
  allUsd: number
  allTxs: number
  currencyPairsArray?: Array<[string, number]>
  currencyPairs: { [currencyPair: string]: number }
}

export interface DataPlusSevenDayAve extends Data {
  sevenDayAve: number
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

const totalsStyle = {
  fontSize: '18px',
  textAlign: 'center' as 'center'
}

const graphHolder = {
  height: '90%'
}

const Graphs: any = (props: {
  rawData: AnalyticsResult[]
  timePeriod: string
}) => {
  let modal
  let tooltip = ''
  let totalUsd = 0
  let totalTxs = 0
  const [altModal, setModal] = useState(<></>)
  const { rawData, timePeriod } = props

  const bars: JSX.Element[] = []

  const data: BarData = rawData.reduce(
    (prev: BarData, analytics: AnalyticsResult, index: number) => {
      const buckets: Bucket[] =
        timePeriod === 'quarter'
          ? createQuarterBuckets(analytics)
          : analytics.result[timePeriod]
      const graphName =
        analytics.partnerId.charAt(0).toUpperCase() +
        analytics.partnerId.slice(1)
      bars.push(
        <Bar
          key={index}
          yAxisId="left"
          stackId="a"
          dataKey={graphName}
          barSize={20}
          fill={Partners[analytics.partnerId].color}
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
          addObject(currencyPairs, prev[start].currencyPairs)
        }
        prev[start].allUsd += usdValue
        totalUsd += usdValue
        prev[start].allTxs += numTxs
        totalTxs += numTxs
        prev[start][graphName] = usdValue
        prev[start][`${graphName}NumTxs`] = numTxs
        prev[start][`${graphName}Color`] = Partners[analytics.partnerId].color
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

  const dataArray = Object.values(data)
  return (
    <>
      <div style={graphHolder}>
        <div style={modalStyle}>{altModal}</div>
        <ResponsiveContainer>
          <ComposedChart
            data={
              props.timePeriod === 'day'
                ? sevenDayDataMerge(dataArray)
                : dataArray
            }
            margin={{
              top: 20,
              right: 20,
              bottom: 0,
              left: 20
            }}
            animationDuration={0}
          >
            <CartesianGrid stroke="#f5f5f5" />
            <XAxis dataKey="date" />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#000000"
              width={105}
            />
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
              stroke="#4E4E4E"
              animationDuration={0}
            />
            {props.timePeriod === 'day' && (
              // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
              <Line
                yAxisId="left"
                type="natural"
                dataKey="sevenDayAve"
                dot={false}
                stroke="#F4b183"
                animationDuration={0}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p style={totalsStyle}>
        Txs: {totalTxs}, Volume: ${Math.floor(totalUsd)}
      </p>
    </>
  )
}
export default Graphs
