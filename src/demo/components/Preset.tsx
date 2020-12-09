import React from 'react'
import Loader from 'react-loader-spinner'

import Partners from '../partners.json'
import Graphs from './Graphs'

export const legendKeys = {
  marginTop: '2px',
  display: 'flex',
  flexDirection: 'row' as 'row'
}

export const legend = {
  marginTop: '-6px',
  marginLeft: '8px',
  fontSize: '18px',
  lineHeight: '30px'
}

const graphLabel = {
  textAlign: 'center' as 'center',
  fontSize: '18px',
  marginTop: '16px',
  color: 'grey'
}

export const legendHolder = {
  width: '95%',
  marginTop: '10px',
  marginLeft: '24px',
  display: 'inline-flex' as 'inline-flex',
  flexWrap: 'wrap' as 'wrap'
}

export const largeGraphHolder = {
  height: '800px'
}

const presetLoader = {
  textAlign: 'center' as 'center',
  marginTop: '20px'
}

const TIME_PERIODS = ['hour', 'day', 'month']
const GRAPH_LABELS = ['36 Hours', '75 Days', '2 Years']

const Preset: any = (props: { dataSets: any; exchangeType: string }) => {
  const graphs: JSX.Element[] = []
  for (const index in props.dataSets) {
    if (props.dataSets[index].length === 0) {
      graphs.push(
        <div key={index} style={presetLoader}>
          <Loader type="Oval" color="blue" height="30px" width="30px" />
        </div>
      )
      continue
    }
    let barGraphData = props.dataSets[index]
    if (props.exchangeType !== 'all') {
      barGraphData = barGraphData.filter(
        obj => Partners[obj.pluginId].type === props.exchangeType
      )
    }

    const barGraphStyles = barGraphData.map((obj, index) => {
      const style = {
        backgroundColor: Partners[obj.pluginId].color,
        marginLeft: '10px',
        width: '18px',
        height: '18px'
      }
      const capitilizedPluginId = `${obj.pluginId
        .charAt(0)
        .toUpperCase()}${obj.pluginId.slice(1)}`
      return (
        <div style={legendKeys} key={index}>
          <div style={style} />
          <div style={legend}>{capitilizedPluginId}</div>
        </div>
      )
    })

    graphs.push(
      <div key={index}>
        <div style={graphLabel}>{`${GRAPH_LABELS[index]}`}</div>
        <div style={legendHolder}>{barGraphStyles}</div>
        <div style={largeGraphHolder}>
          <Graphs rawData={barGraphData} timePeriod={TIME_PERIODS[index]} />
        </div>
      </div>
    )
  }

  return <>{graphs}</>
}
export default Preset
