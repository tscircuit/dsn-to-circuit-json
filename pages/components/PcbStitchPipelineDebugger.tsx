import { useMemo } from "react"
import { PcbStitchPipelineSolver } from "../../lib/PcbStitchPipelineSolver/PcbStitchPipelineSolver"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"

export const PcbStitchPipelineDebugger = (
  props: ConstructorParameters<typeof PcbStitchPipelineSolver>,
) => {
  const solver = useMemo(() => {
    return new PcbStitchPipelineSolver(...props)
  }, [])
  return <GenericSolverDebugger solver={solver} />
}
