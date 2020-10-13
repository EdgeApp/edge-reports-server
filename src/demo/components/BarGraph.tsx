import '../demo.css'

import React from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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

const BarGraph: any = (props: {
  rawData: AnalyticsResult[]
  timePeriod: string
  colors: string[]
}) => {
  const { rawData, timePeriod } = props
  const keys = props.rawData.map((analyticsResult) => {
    return (
      analyticsResult.pluginId.charAt(0).toUpperCase() +
      analyticsResult.pluginId.slice(1)
    )
  })
  const colors = {}
  for (let i = 0; i < rawData.length; i++) {
    colors[keys[i]] = props.colors[i]
  }
  const tickRate: string[] = []
  let tickSpace = 0
  tickSpace = Math.floor(rawData[0].result[timePeriod].length / 5)
  if (tickSpace === 0) tickSpace++

  const data = rawData[0].result[timePeriod].map((bucket: Bucket, index) => {
    let date
    if (timePeriod === 'month') {
      date = bucket.isoDate.slice(0, 7)
    } else if (timePeriod === 'day') {
      date = bucket.isoDate.slice(0, 10)
    } else {
      date = bucket.isoDate.slice(0, 10) + ':' + bucket.isoDate.slice(11, 13)
    }
    if (index % tickSpace === 0) {
      tickRate.push(date)
    }
    const currencyPairs = {}
    for (const bucket of rawData) {
      for (const [key, value] of Object.entries(
        bucket.result[timePeriod][index].currencyPairs
      )) {
        if (currencyPairs[key] == null) {
          currencyPairs[key] = value
          continue
        }
        currencyPairs[key] += value
      }
    }
    const currencyPairArray = Object.entries(currencyPairs).sort(
      (a, b) => b[1] - a[1]
    )
    return { date, allUsd: 0, allTxs: 0, currencyPairs: currencyPairArray }
  })
  for (let i = 0; i < rawData.length; i++) {
    for (let j = 0; j < rawData[0].result[timePeriod].length; j++) {
      const graphName =
        rawData[i].pluginId.charAt(0).toUpperCase() +
        rawData[i].pluginId.slice(1)
      data[j].allUsd += rawData[i].result[timePeriod][j].usdValue
      data[j][graphName] = rawData[i].result[timePeriod][j].usdValue
      data[j].allTxs += rawData[i].result[timePeriod][j].numTxs
      data[j][`${graphName}NumTxs`] = rawData[i].result[timePeriod][j].numTxs
      data[j][`${graphName}Color`] = props.colors[i]
    }
  }

  const bars = rawData.map((obj, index) => {
    const graphName =
      obj.pluginId.charAt(0).toUpperCase() + obj.pluginId.slice(1)
    return (
      <Bar
        yAxisId="left"
        stackId="a"
        dataKey={graphName}
        barSize={20}
        fill={data[0][`${graphName}Color`]}
        onMouseOver={() => (tooltip = graphName)}
        onMouseLeave={() => (tooltip = '')}
        animationDuration={0}
      />
    )
  })

  let tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && tooltip !== '') {
      for (const bar of payload) {
        if (bar.dataKey === tooltip) {
          const currencyPairs: JSX.Element[] = []
          let index = 0
          for (const [key, value] of bar.payload.currencyPairs) {
            currencyPairs.push(
              <div key={index} className="currency-pair-holder">
                <div className="currency-pair-name">{`${key}:`}</div>
                <div className="currency-pair-usd">{`$${value.toFixed(
                  2
                )}`}</div>
              </div>
            )
            index++
            if (index === 15) break
          }
          const verticalBlockHolder = {
            display: 'flex' as 'flex',
            flexDirection: 'column' as 'column',
            borderRadius: '2px',
            backgroundColor: 'rgb(255,255,255)',
            border: '1px solid #BFBFBF',
          }
          const horizontalBlockHolder = {
            display: 'flex' as 'flex',
            flexDirection: 'row' as 'row',
          }
          const blocks = {
            width: '10px',
            height: '10px',
          }
          const styleTwo = {
            backgroundColor: 'rgb(255,255,255)',
            fontFamily: 'Quicksand',
            fontStyle: 'normal' as 'normal',
            fontWeight: 'normal' as 'normal',
            fontSize: '16px',
          }
          return (
            <div style={verticalBlockHolder}>
              <div style={blocks} />
              <div style={horizontalBlockHolder}>
                <div style={blocks} />
                <div style={styleTwo}>
                  <div>{`PluginId: ${tooltip}`}</div>
                  <div>{`Date: ${bar.payload.date}`}</div>
                  <div>{`Plugin USD: $${bar.payload[tooltip].toFixed(2)}`}</div>
                  <div>{`Plugin Transactions: ${
                    bar.payload[`${tooltip}NumTxs`]
                  }`}</div>
                  <hr className="divider" />
                  <div className="total-usd">{`Total USD: $${bar.payload.allUsd.toFixed(
                    2
                  )}`}</div>
                  <div>{`Total Transactions: ${bar.payload.allTxs}`}</div>
                  <div className="currency-pairs">{currencyPairs}</div>
                </div>
                <div style={blocks} />
              </div>
              <div style={blocks} />
            </div>
          )
        }
      }
    }

    return null
  }

  return (
    <>
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }}
          animationDuration={0}
        >
          <CartesianGrid stroke="#f5f5f5" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke="#000000" />
          <YAxis yAxisId="right" orientation="right" stroke="#000000" />
          <Tooltip content={<CustomTooltip />} />
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
export default BarGraph
