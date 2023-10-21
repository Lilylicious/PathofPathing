import { SkillTreeData } from "../../models/SkillTreeData";
import { SkillNode, SkillNodeStates } from "../../models/SkillNode";
import { FibonacciHeap } from "mnemonist";
import { Graph } from "./Graph"


export class ScienceAlgorithm {
    skillTreeData: SkillTreeData;
    initialFixedSet: PotentialTree[];
    treeWeights: {[label: string]: number}

    constructor(treeData: SkillTreeData) {
        this.skillTreeData = treeData;
        this.treeWeights = {}
        
        this.initialFixedSet = []
        const nodes = Object.values(this.skillTreeData.nodes).sort((a,b) => a.skill - b.skill);
        for(const node of nodes){
            this.initialFixedSet.push(new PotentialTree(node, []))
        }
    }

    Execute(): void {        
        const nodesToDisable = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).filter(node => node.classStartIndex === undefined && !node.isAscendancyStart)
        for (const node of nodesToDisable){
            this.skillTreeData.removeState(node, SkillNodeStates.Active);
        }

        // This may be an issue with ascendant
        const classStart = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Desired)).filter(node => node.classStartIndex !== undefined)[0];
        const desiredNodes = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Desired)).filter(node => !node.isAscendancyStart && node.classStartIndex === undefined).sort((a,b) => a.skill - b.skill);
        const distances: {[potentialTreeHash: string]: number} = {}
        const parent: {[potentialTreeHash: string]: PotentialTree[]} = {}

        const heap = new FibonacciHeap<PotentialTree>((a,b) => {
            const distA = distances[a.getHash()] ?? 0;
            const distB = distances[b.getHash()] ?? 0;

            let aWeight = 0;
            let bWeight = 0;

            //This is here so I can disable the new weights easily
            if(true){
                aWeight = 100000;
                bWeight = 100000;
    
                if(a.desiredNodesHit.length === 0 || (a.desiredNodesHit.length === 1 && a.desiredNodesHit[0].id === a.specialNode.id)){
                    aWeight = 0;
                } else {
                    const aDesiredNotHit = desiredNodes.filter(node => !a.desiredNodesHit.includes(node))
                    for(const desiredNode of aDesiredNotHit){
                        const smallerNodeId = a.specialNode.skill > desiredNode.skill ? desiredNode.id : a.specialNode.id
                        const higherNodeId = a.specialNode.skill < desiredNode.skill ? a.specialNode.id : desiredNode.id
                        const lowerNodeIndex = this.skillTreeData.nodeLabelDict[smallerNodeId]
                        const higherNodeIndex = this.skillTreeData.nodeLabelDict[higherNodeId]
        
                        const weight = this.skillTreeData.distanceArrays[higherNodeIndex][lowerNodeIndex]
        
                        if(aWeight > weight) aWeight = weight
                    }
                }
                if(b.desiredNodesHit.length === 0 || (b.desiredNodesHit.length === 1 && b.desiredNodesHit[0].id === b.specialNode.id)){
                    bWeight = 0;
                } else {
                    const bDesiredNotHit = desiredNodes.filter(node => !b.desiredNodesHit.includes(node))
                    for(const desiredNode of bDesiredNotHit){
                        const smallerNodeId = b.specialNode.skill > desiredNode.skill ? desiredNode.id : b.specialNode.id
                        const higherNodeId = b.specialNode.skill < desiredNode.skill ? b.specialNode.id : desiredNode.id
                        const lowerNodeIndex = this.skillTreeData.nodeLabelDict[smallerNodeId]
                        const higherNodeIndex = this.skillTreeData.nodeLabelDict[higherNodeId]
        
                        const weight = this.skillTreeData.distanceArrays[higherNodeIndex][lowerNodeIndex]
        
                        if(bWeight > weight) bWeight = weight
                    }
                }
                aWeight += this.getSpanningTreeWeight(a, desiredNodes, classStart, this.skillTreeData.nodeLabelDict, this.skillTreeData.distanceArrays) / 2;
                bWeight += this.getSpanningTreeWeight(b, desiredNodes, classStart, this.skillTreeData.nodeLabelDict, this.skillTreeData.distanceArrays) / 2;
            }            

            return (distA + aWeight) - (distB + bWeight);
        })

        const fixedSet: {[hash: string]: PotentialTree} = {}

        for(const node of desiredNodes){
            const potential = new PotentialTree(node, [node])
            heap.push(potential);
            distances[potential.getHash()] = 0
        }

        for(const potentialTree of this.initialFixedSet){
            const newPotential = new PotentialTree(potentialTree.specialNode, potentialTree.desiredNodesHit)
            fixedSet[newPotential.getHash()] = newPotential
            distances[newPotential.getHash()] = 0
        }

        let finalPop: PotentialTree | undefined = undefined;
        
        let checkCount = 0
        while(heap.size > 0){
            checkCount++
            //Get item with lowest distance
            const heapPop = heap.pop();
            if(heapPop === undefined) break;
            fixedSet[heapPop.getHash()] = heapPop

            //Get adjacent node IDs
            const adjacent = [...new Set([...heapPop.specialNode.out, ...heapPop.specialNode.in])]
            .filter(nodeId => this.skillTreeData.nodes[nodeId].ascendancyName === '' 
            && !this.skillTreeData.nodes[nodeId].is(SkillNodeStates.UnDesired)
            && this.skillTreeData.nodes[nodeId].name !== 'Position Proxy'
            )

            for(const adjacentNode of adjacent){
                // New potential tree with the adjacent node but the same desired nodes
                const newPotential = new PotentialTree(this.skillTreeData.nodes[adjacentNode], heapPop.desiredNodesHit)
                // If we already have the new potential, skip
                if(fixedSet[newPotential.getHash()] !== undefined) continue;

                // Grab the distances
                const heapPopDistance = distances[heapPop.getHash()];
                const adjDistance = distances[newPotential.getHash()] ?? 10000000;

                // If the new potential tree doesn't have a distance, set it and it's parents
                if(heapPopDistance + 1 < adjDistance){
                    distances[newPotential.getHash()] = heapPopDistance + 1;
                    parent[newPotential.getHash()] = [heapPop];
                    heap.push(newPotential)
                }
            }
            
            for(const fixedTree of Object.values(fixedSet)){
                if(fixedTree.specialNode === heapPop.specialNode){
                    
                    //console.time('Disjoint check')
                    let disjoint = true;
                    const nodesHit: {[nodeId: string]: SkillNode} = {}
                    for(const node of heapPop.desiredNodesHit){
                        nodesHit[node.skill] = node;
                    }
                    for(const node of fixedTree.desiredNodesHit){
                        if(nodesHit[node.skill] !== undefined)
                            disjoint = false;
                    }

                    if(disjoint){
                        const combined = new PotentialTree(fixedTree.specialNode, fixedTree.desiredNodesHit.concat(heapPop.desiredNodesHit));
                        const heapPopDistance = distances[heapPop.getHash()];
                        const fixedDistance = distances[fixedTree.getHash()];
                        const existingCombinedDistance = distances[combined.getHash()]
                        const combinedDistance = heapPopDistance + fixedDistance;

                        if(existingCombinedDistance === undefined || combinedDistance < existingCombinedDistance){
                            distances[combined.getHash()] = combinedDistance;
                            parent[combined.getHash()] = [fixedTree, heapPop];
                            heap.push(combined);
                        }
                    }
                }
            }
            
            if(heapPop.specialNode.classStartIndex === this.skillTreeData.getStartClass() && heapPop.desiredNodesHit.map(n => n.skill).join() === desiredNodes.map(n => n.skill).join()){
                finalPop = heapPop;
                break;
            }                
        }
        if(finalPop === undefined)
            return;

        let parentQueue: PotentialTree[] | undefined = parent[finalPop.getHash()];
        const path = new Set<SkillNode>().add(finalPop.specialNode);
        let count2 = 0;
        console.log(checkCount + ' checks')
        while (parentQueue.length > 0 && count2++ < 100) {
            const nextTree = parentQueue.pop();
            if(nextTree === undefined) break;
            path.add(nextTree.specialNode);
            const nextParent = parent[nextTree.getHash()]
            if(nextParent !== undefined){
                if(nextParent[0] !== undefined) parentQueue.push(nextParent[0])
                if(nextParent[1] !== undefined) parentQueue.push(nextParent[1])
            }            
        }
        for(const node of path){
            if(!node.is(SkillNodeStates.Active)){
                this.skillTreeData.addState(node, SkillNodeStates.Active)
            }
        }
    }

    getSpanningTreeWeight(potential: PotentialTree, desired: SkillNode[], classStart: SkillNode, nodeLabelDict: {[id: string]: number}, distanceArrays: number[][]): number {
        const nodeSet: string[] = desired.filter(node => !potential.desiredNodesHit.includes(node)).map(node => node.id);
        if(!nodeSet.includes(classStart.id)) nodeSet.push(classStart.id);
    
        const hash = nodeSet.sort((a,b) => Number(a) - Number(b)).join('-');
        if(this.treeWeights[hash] !== undefined) return this.treeWeights[hash];
        const allNodes = [...nodeSet]

        const graph = new Graph();  
        let graphWeight = 0
        for(const nodeId of allNodes){
            for(const otherNodeId of allNodes){
                if(nodeId === otherNodeId) continue;

                let lowerNode = ''
                let higherNode = ''

                if(Number(nodeId) > Number(otherNodeId)) {
                    lowerNode = otherNodeId;
                    higherNode = nodeId;
                } else if(Number(nodeId) < Number(otherNodeId)) {
                    lowerNode = nodeId;
                    higherNode = otherNodeId;
                }

                const weight = distanceArrays[nodeLabelDict[higherNode]][nodeLabelDict[lowerNode]];

                graph.addEdge(lowerNode, higherNode, weight);
            }
        }

        if(graph.addedEdges.length === 0){
            this.treeWeights[hash] = 0
            return 0;
        }

        const foundNodes: Set<string> = new Set();
        let failsafe = 0;
        while(foundNodes.size < allNodes.length){
            if(failsafe++ > 150){
                console.log('Breaking because infinite loop in MST check')
                break;
            }
            const minEdge = graph.edges.pop();
            if(minEdge === undefined) break;
            
            if(foundNodes.has(minEdge.higherNode) && foundNodes.has(minEdge.lowerNode))
                continue;

            graphWeight += minEdge.weight;
            foundNodes.add(minEdge.lowerNode)
            foundNodes.add(minEdge.higherNode)          
        }
        this.treeWeights[hash] = graphWeight;

        return this.treeWeights[hash];
    }
}



class PotentialTree {
    specialNode: SkillNode;
    desiredNodesHit: SkillNode[];

    constructor(specialNode: SkillNode, desiredNodesHit: SkillNode[]){
        this.specialNode = specialNode;
        this.desiredNodesHit = desiredNodesHit.sort((a,b) => a.skill - b.skill);
    }
    
    getHash(): string {        
        return this.specialNode.skill + '-' + (this.desiredNodesHit.map(node => node.skill).sort((a,b) => Number(a) - Number(b)).join('-'))
    }
}