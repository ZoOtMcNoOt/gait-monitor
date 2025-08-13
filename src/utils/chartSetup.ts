import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  LineController,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

// Register Chart.js components only once
let isRegistered = false

export const registerChartComponents = () => {
  if (!isRegistered) {
    ChartJS.register(
      CategoryScale,
      LinearScale,
      PointElement,
      LineElement,
      Title,
      Tooltip,
      Legend,
      TimeScale,
      LineController,
    )
    isRegistered = true
  }
}

export default ChartJS
