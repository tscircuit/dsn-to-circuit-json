import { DsnToCircuitJsonConverterStage } from "../types"

/**
 * CollectNetsStage creates source_net and source_trace elements from DSN network section.
 *
 * DSN Network Section:
 * (network
 *   (net <net_name>
 *     (pins <component_ref>-<pin_id> <component_ref>-<pin_id> ...)
 *   )
 *   (class <class_name> <net_name> <net_name> ...
 *     (rule (width 200) (clearance 200))
 *   )
 * )
 *
 * This stage:
 * 1. Creates source_net elements for each net
 * 2. Creates source_trace elements to connect ports belonging to the same net
 * 3. Associates pcb_ports with their nets
 *
 * Net naming in DSN:
 * - Net names can be quoted strings or identifiers
 * - Pin references format: "component_ref-pin_id" (e.g., "R1-1", "U1-VCC")
 */
export class CollectNetsStage extends DsnToCircuitJsonConverterStage {
  private processedNets = new Set<string>()

  step(): boolean {
    const { specctraDsn: spectraDsn } = this.ctx

    const network = spectraDsn.network
    if (!network) {
      this.finished = true
      return false
    }

    // Process each net
    for (const net of network.nets || []) {
      const netName = net.netName
      if (!netName || this.processedNets.has(netName)) continue

      this.processNet(net)
      this.processedNets.add(netName)
    }

    this.finished = true
    return false
  }

  private processNet(net: any): void {
    const netName = net.netName
    if (!netName) return

    // Collect pin references from the net
    // Pins can be directly on the net or in a (pins ...) child
    const pinRefs: string[] = []

    // Check for direct pins property
    if (net.pins && Array.isArray(net.pins)) {
      pinRefs.push(...net.pins)
    }

    // Check for (pins ...) child in otherChildren
    for (const child of net.otherChildren || []) {
      if (child.token === "pins") {
        const pinsChild = child as any
        if (pinsChild.pinRefs && Array.isArray(pinsChild.pinRefs)) {
          pinRefs.push(...pinsChild.pinRefs)
        }
      }
    }

    // Create source_net
    const sourceNetInserted = this.ctx.db.source_net.insert({
      name: netName,
      member_source_group_ids: [],
    } as any)

    const sourceNetId = sourceNetInserted.source_net_id
    this.ctx.netNameToId!.set(netName, sourceNetId)

    // Collect connected port IDs
    const connectedPortIds: string[] = []

    for (const pinRef of pinRefs) {
      const portId = this.ctx.pinRefToPortId?.get(pinRef)
      if (portId) {
        connectedPortIds.push(portId)
      } else {
        // Try alternative formats
        // DSN sometimes uses different separators
        const altPinRef = pinRef.replace("-", "_")
        const altPortId = this.ctx.pinRefToPortId?.get(altPinRef)
        if (altPortId) {
          connectedPortIds.push(altPortId)
        }
      }
    }

    // Create source_trace if there are connected ports or if net has pins
    if (connectedPortIds.length >= 2 || pinRefs.length >= 2) {
      // Use existing source_port IDs from CollectPadsStage if available
      const sourcePortIds: string[] = []

      for (const pinRef of pinRefs) {
        // Look up source_port by pinRef
        const existingPortId = this.findSourcePortByPinRef(pinRef)
        if (existingPortId) {
          sourcePortIds.push(existingPortId)
        }
      }

      // Create source_trace connecting all ports
      const sourceTrace = this.ctx.db.source_trace.insert({
        connected_source_port_ids: sourcePortIds,
        connected_source_net_ids: [sourceNetId],
        display_name: netName,
      } as any)

      // Store the mapping for trace creation
      this.ctx.netNameToSourceTraceId!.set(netName, sourceTrace.source_trace_id)
    }
  }

  /**
   * Find source_port by pin reference.
   * Pin reference format: "componentRef-pinId" (e.g., "R1-1", "U1-VCC")
   */
  private findSourcePortByPinRef(pinRef: string): string | undefined {
    // Look through all source_ports to find matching one
    const sourcePorts = this.ctx.db.source_port.list()

    for (const port of sourcePorts) {
      if ((port as any).name === pinRef) {
        return (port as any).source_port_id
      }
    }

    return undefined
  }
}
