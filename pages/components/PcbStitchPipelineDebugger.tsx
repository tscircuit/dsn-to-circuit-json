import { useMemo } from "react"
import {
  PcbStitchPipelineSolver,
  type PcbStitchInputProblem,
} from "lib/PcbStitchPipelineSolver/PcbStitchPipelineSolver"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"

export const PcbStitchPipelineDebugger = (props: {
  inputProblem: PcbStitchInputProblem
}) => {
  const solver = useMemo(() => {
    return new PcbStitchPipelineSolver(props.inputProblem)
  }, [])
  return <GenericSolverDebugger solver={solver} />
}
