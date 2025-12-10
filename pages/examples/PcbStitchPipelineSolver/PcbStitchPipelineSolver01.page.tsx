import { PcbStitchPipelineDebugger } from "../../components/PcbStitchPipelineDebugger"
import { parseSpectraSes, parseSpectraDsn } from "dsnts"
import sesRaw from "pages/repros/repro02/assets/LGA15x4_net15_bottom_only.ses?raw"
import dsnRaw from "pages/repros/repro02/assets/LGA15x4_net15_bottom_only_input.dsn?raw"

export default () => (
  <PcbStitchPipelineDebugger
    inputProblem={{
      ses: parseSpectraSes(sesRaw),
      dsn: parseSpectraDsn(dsnRaw),
    }}
  />
)
