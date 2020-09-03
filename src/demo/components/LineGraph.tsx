import { ResponsiveLine } from '@nivo/line'
import React from 'react'

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

const LineGraph: any = (props: {
  analyticsRequest: AnalyticsResult
  timePeriod: string
  color: string
}) => {
  const { analyticsRequest, timePeriod } = props
  const tickRate: string[] = []
  let tickSpace = 0
  tickSpace = Math.floor(analyticsRequest.result[timePeriod].length / 5)
  if (tickSpace === 0) tickSpace++

  const inputData = analyticsRequest.result[timePeriod].map(
    (bucket: Bucket, index) => {
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
      return {
        x: date,
        y: bucket.usdValue,
        numTxs: bucket.numTxs
      }
    }
  )

  const data = [
    {
      id:
        analyticsRequest.pluginId.charAt(0).toUpperCase() +
        analyticsRequest.pluginId.slice(1),
      color: props.color,
      data: inputData
    }
  ]

  const theme = {
    axis: {
      ticks: {
        text: {
          fill: '#333333',
          fontSize: 14
        }
      }
    },
    legends: {
      text: {
        fill: '#333333',
        fontSize: 18
      }
    }
  }

  return (
    <ResponsiveLine
      data={data}
      theme={theme}
      margin={{ top: 70, right: 65, bottom: 100, left: 80 }}
      xScale={{ type: 'point' }}
      yScale={{
        type: 'linear',
        min: 0,
        max: 'auto',
        stacked: true,
        reverse: false
      }}
      enableGridX={false}
      axisTop={null}
      axisRight={null}
      axisBottom={{
        orient: 'bottom',
        tickSize: 5,
        tickValues: tickRate,
        tickPadding: 15,
        tickRotation: 0
      }}
      axisLeft={{
        orient: 'left',
        tickSize: 5,
        tickPadding: 7,
        tickRotation: 0
      }}
      colors={[props.color]}
      pointSize={4}
      pointColor={{ theme: 'background' }}
      pointBorderWidth={4}
      pointBorderColor={{ from: 'serieColor' }}
      pointLabel="y"
      pointLabelYOffset={-12}
      useMesh
      tooltip={input => {
        const style = {
          backgroundColor: 'rgb(255,255,255)'
        }
        const usdAmount = input.point.data.y.toFixed(2)
        return (
          <div style={style}>
            <div>{`Date: ${input.point.data.x}`}</div>
            <div>{`USD Value: ${usdAmount}`}</div>
            <div>{`Transactions: ${input.point.data.numTxs}`}</div>
          </div>
        )
      }}
      animate={false}
    />
  )
}
export default LineGraph
