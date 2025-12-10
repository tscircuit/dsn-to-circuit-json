import { DsnToCircuitJsonConverterStage } from "../types"
import { applyToPoint } from "transformation-matrix"
import type { PcbBoard } from "circuit-json"

/**
 * CollectBoardInfoStage extracts board information from the DSN structure section.
 *
 * This stage handles:
 * 1. Extracting board boundary/outline from structure.boundary
 * 2. Creating pcb_board element with outline and dimensions
 * 3. Extracting layer information (number of layers)
 *
 * DSN Structure Section:
 * (structure
 *   (boundary (path pcb 0 x1 y1 x2 y2 ...))
 *   (layer F.Cu (type signal) (property (index 0)))
 *   (layer B.Cu (type signal) (property (index 1)))
 *   (via "Via[0-1]_800:400_um")
 *   (rule (width 200) (clearance 200))
 * )
 *
 * Circuit JSON pcb_board:
 * {
 *   type: "pcb_board",
 *   center: { x, y },
 *   width?: number,
 *   height?: number,
 *   outline?: { x, y }[],
 *   num_layers: number
 * }
 */
export class CollectBoardInfoStage extends DsnToCircuitJsonConverterStage {
  step(): boolean {
    const { specctraDsn: spectraDsn, dsnToCircuitJsonTransformMatrix } =
      this.ctx

    if (!dsnToCircuitJsonTransformMatrix) {
      throw new Error("Transform matrix not initialized")
    }

    const structure = spectraDsn.structure
    if (!structure) {
      // No structure section, create a default board
      this.ctx.db.pcb_board.insert({
        center: { x: 0, y: 0 },
        width: 100,
        height: 100,
      } as PcbBoard)
      this.finished = true
      return false
    }

    // Extract boundary
    const boundary = structure.boundary
    const outlinePoints: Array<{ x: number; y: number }> = []

    if (boundary) {
      // Process paths
      for (const path of boundary.paths || []) {
        const coords = path.coordinates || []
        for (let i = 0; i < coords.length; i += 2) {
          if (coords[i] !== undefined && coords[i + 1] !== undefined) {
            const transformed = applyToPoint(dsnToCircuitJsonTransformMatrix, {
              x: coords[i]!,
              y: coords[i + 1]!,
            })
            outlinePoints.push(transformed)
          }
        }
      }

      // Process rects
      for (const rect of boundary.rects || []) {
        if (
          rect.x1 !== undefined &&
          rect.y1 !== undefined &&
          rect.x2 !== undefined &&
          rect.y2 !== undefined
        ) {
          // Convert rectangle to outline points (4 corners)
          const corners = [
            { x: rect.x1, y: rect.y1 },
            { x: rect.x2, y: rect.y1 },
            { x: rect.x2, y: rect.y2 },
            { x: rect.x1, y: rect.y2 },
            { x: rect.x1, y: rect.y1 }, // Close the path
          ]
          for (const corner of corners) {
            const transformed = applyToPoint(
              dsnToCircuitJsonTransformMatrix,
              corner,
            )
            outlinePoints.push(transformed)
          }
        }
      }
    }

    let centerX = 0
    let centerY = 0

    if (outlinePoints.length > 0) {
      const xs = outlinePoints.map((p) => p.x)
      const ys = outlinePoints.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)

      centerX = (minX + maxX) / 2
      centerY = (minY + maxY) / 2
    }

    // Count layers
    const numLayers = (structure.layers || []).length || 2

    // Create pcb_board
    const boardData: any = {
      center: { x: centerX, y: centerY },
      thickness: 1.4, // Standard PCB thickness in mm
      num_layers: numLayers,
    }

    if (outlinePoints.length > 0) {
      boardData.outline = outlinePoints
    }

    this.ctx.db.pcb_board.insert(boardData)

    this.finished = true
    return false
  }
}
