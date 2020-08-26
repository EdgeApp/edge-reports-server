import { ResponsiveBar } from '@nivo/bar'
import React from 'react'

interface Bucket {
  start: number
  usdValue: number
  isoDate: string
  currencyCodes: { [currencyCode: string]: number }
  currencyPairs: { [currencyPair: string]: number }
}

interface AnalyticsResult {
  result: {
    hour: Bucket[]
    day: Bucket[]
    month: Bucket[]
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
  const getColor = (bar): any => colors[bar.id]
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
    return { date }
  })
  for (let i = 0; i < rawData.length; i++) {
    for (let j = 0; j < rawData[0].result[timePeriod].length; j++) {
      const graphName =
        rawData[i].pluginId.charAt(0).toUpperCase() +
        rawData[i].pluginId.slice(1)
      data[j][graphName] = rawData[i].result[timePeriod][j].usdValue
      data[j][`${graphName}Color`] = props.colors[i]
    }
  }

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
    <>
      <ResponsiveBar
        data={data}
        keys={keys}
        indexBy="date"
        theme={theme}
        margin={{ top: 70, right: 65, bottom: 100, left: 80 }}
        padding={0.24}
        colors={getColor}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickValues: tickRate,
          tickPadding: 15,
          tickRotation: 0,
          legend: '',
          legendPosition: 'middle',
          legendOffset: 36
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 7,
          tickRotation: 0,
          legend: '',
          legendPosition: 'middle',
          legendOffset: -40
        }}
        enableLabel={false}
        labelSkipWidth={12}
        labelSkipHeight={12}
        labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
        animate={false}
      />
    </>
  )
}
export default BarGraph
