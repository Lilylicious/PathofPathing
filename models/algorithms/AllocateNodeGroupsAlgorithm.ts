import { SkillTreeData } from "../SkillTreeData";
import { IAllocationAlgorithm } from "./IAllocationAlgorithm";
import { SkillNode, SkillNodeStates } from "../SkillNode";
import { ShortestPathToDesiredAlgorithm } from "./ShortestPathToDesiredAlgorithm";
import { ShortestPathAlgorithm } from "./ShortestPathAlgorithm";
import { versions } from "../versions/verions";
import FibonacciHeap from "mnemonist/fibonacci-heap";
import { beforeAll } from "bun:test";
import { group } from "console";


export class AllocateNodeGroupsAlgorithm implements IAllocationAlgorithm {
    skillTreeData: SkillTreeData;
    fixedGroups: { abyssGroup: number; exarchGroup: number; }


    constructor(treeData: SkillTreeData, fixedGroups: { abyssGroup: number; exarchGroup: number; }) {
        this.skillTreeData = treeData;
        this.fixedGroups = fixedGroups;
    }

    Execute(shortestPathAlgorithm: ShortestPathToDesiredAlgorithm): void {
        const debug = false
        const nodesToDisable = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).filter(node => !node.is(SkillNodeStates.Desired) && node.classStartIndex === undefined && !node.isAscendancyStart)
        for (const node of nodesToDisable) {
            this.skillTreeData.removeState(node, SkillNodeStates.Active);
        }

        // const startNodes = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active))
        //     .filter(node => node.classStartIndex !== undefined)[0]?.out
        //     .filter(nodeId => this.skillTreeData.nodes[nodeId].isAscendancyStart === false)
        //     .map(nodeId => this.skillTreeData.nodes[nodeId])
        //     .filter(node => !node.is(SkillNodeStates.UnDesired));
        const desiredNodesUnsorted = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Desired))

        let nodeGroups: SkillNode[][] = [];

        for (const node of desiredNodesUnsorted) {
            this.skillTreeData.addState(node, SkillNodeStates.Active)
            nodeGroups.push([node])
        }



        let allAdjacentsMerged = false;
        while (!allAdjacentsMerged) {
            let node1: SkillNode | undefined = undefined;
            let node2: SkillNode | undefined = undefined;
            for (const group of nodeGroups) {
                for (const node of group) {
                    if (node.isMastery) continue;
                    const adjacents = [...node.in, ...node.out];
                    for (const adjacent of adjacents) {
                        const adjacentNode = this.skillTreeData.nodes[adjacent];
                        if (adjacentNode.isMastery) continue;
                        if (adjacentNode.is(SkillNodeStates.Active) && !group.includes(adjacentNode)) {
                            node1 = node;
                            node2 = adjacentNode;
                            break;
                        }
                    }

                    if (node1 && node2) break;
                }
                if (node1 && node2) break;
            }

            if (node1 && node2) {
                const originGroup = nodeGroups.find(group => group.includes(node1!))
                const targetGroup = nodeGroups.find(group => group.includes(node2!))
                const mergedGroup = this.mergeGroups(originGroup!, targetGroup!);
                nodeGroups = nodeGroups.filter(group => group.map(node => node.skill).sort().join(',') !== originGroup!.map(node => node.skill).sort().join(',') && group.map(node => node.skill).sort().join(',') != targetGroup!.map(node => node.skill).sort().join(','));
                nodeGroups.push(mergedGroup);
            } else {
                allAdjacentsMerged = true;
            }
        }


        const desiredAdjustment = 0.01;
        const desiredGroupDistances = this.adjustDesiredGroupDistances(desiredNodesUnsorted.filter(node => node.isNotable), desiredAdjustment)

        for (const node of Object.values(this.skillTreeData.nodes).filter(node => node.isNotable)) {
            desiredGroupDistances[node.skill] = desiredGroupDistances[node.skill] ? desiredGroupDistances[node.skill] - 0.5 : 0.5;

            for (const stat of node.stats) {
                if (stat.includes('maximum Life')) desiredGroupDistances[node.skill] = desiredGroupDistances[node.skill] ? desiredGroupDistances[node.skill] - (2 * desiredAdjustment) : 1 - (2 * desiredAdjustment);
            }
        }

        const travelStats = ['1% increased quantity of items found in your maps', '3% increased scarabs found in your maps', '2% increased effect of modifiers on your maps', '2% chance for one monster in each of your maps to drop an additional connected map']

        for (const index in nodeGroups) {
            if (nodeGroups[index].some(node => node.classStartIndex !== undefined)) continue;

            const frontier = [...nodeGroups[index]];
            const exitNodes: SkillNode[] = [];
            const visited: SkillNode[] = [];

            while (frontier.length > 0) {
                const frontierNode = frontier.shift();
                if (frontierNode === undefined) break;
                const adjacent = [...new Set([...frontierNode.in, ...frontierNode.out])].filter(id =>
                    !([...exitNodes, ...visited].map(node => node.GetId())).includes(id)
                );

                for (const adjacentId of adjacent) {
                    const adjacentNode = this.skillTreeData.nodes[adjacentId];
                    if (adjacentNode.isRegular1 || adjacentNode.stats.some(stat => travelStats.includes(stat.toLowerCase()))) {
                        exitNodes.push(adjacentNode);
                    } else {
                        frontier.push(adjacentNode);
                        visited.push(adjacentNode);
                    }
                }
            }

            if (exitNodes.length === 1) {
                const node = exitNodes[0];

                this.skillTreeData.addState(node, SkillNodeStates.Active);

                const adjacents = [...new Set([...node.in, ...node.out])]
                let groupFound = false;
                for (const index in nodeGroups) {
                    if (nodeGroups[index].map(groupNode => groupNode.GetId()).includes(node.GetId()))
                        continue;

                    if (nodeGroups[index].some(groupNode => adjacents.includes(groupNode.GetId()))) {
                        nodeGroups[index].push(node);
                        groupFound = true;
                        break;
                    }
                }

                if (!groupFound) {
                    nodeGroups.push([node]);
                }
            }
        }


        //console.log(nodeGroups)
        //return;


        // const singleEntranceNodes: { [node: string]: number } = {}
        // for (const node of Object.values(this.skillTreeData.nodes).filter(node => node.isMastery)) {
        //     const debugSingleEntrance = false//node.skill === 1240
        //     const groupNodes = node.nodeGroup?.nodes
        //     if (groupNodes === undefined) continue;
        //     const nodes = [...groupNodes]
        //     if(this.skillTreeData.tree.slice(0,5) === 'Atlas'){
        //         if (nodes.includes('65499')) nodes.push('54499', '55003')
        //         if (nodes.includes('19599')) nodes.push('9338', '50203', '5515')
        //         if (nodes.includes('60105')) nodes.push('62161', '4703', '27878')
        //         if (nodes.includes('26320')) nodes.push('44872', '59578', '41869')
        //         if (nodes.includes('1240')) nodes.push('50610', '3198', '54101')
        //     }

        //     const potentialOutsideNodes: SkillNode[] = []

        //     for (const id of nodes) {
        //         if (debugSingleEntrance) console.log('Checking group node ' + id)
        //         const searchNode = this.skillTreeData.nodes[id];
        //         if(searchNode === undefined) continue;
        //         const adjacent = [...searchNode.in, ...searchNode.out]
        //         for (const adjacentId of adjacent) {
        //             if (debugSingleEntrance) console.log('Checking adjacent node ' + adjacentId)
        //             const adjacentNode = this.skillTreeData.nodes[adjacentId];
        //             //if(!nodes.includes(adjacentId) || adjacentNode.stats.map(stat => stat.toLocaleLowerCase()).some(stat => travelStats.includes(stat))){
        //             for (const stat of adjacentNode.stats) {
        //                 if (debugSingleEntrance) console.log('Checking stat ' + stat.toLocaleLowerCase())
        //                 if (travelStats.includes(stat.toLowerCase()) && !potentialOutsideNodes.includes(adjacentNode)) {
        //                     if (debugSingleEntrance) console.log('Adding outside node ' + adjacentId)
        //                     potentialOutsideNodes.push(adjacentNode);
        //                 }
        //             }
        //             //}
        //         }

        //     }

        //     if (debugSingleEntrance) console.log('potential outside nodes length' + potentialOutsideNodes.length)
        //     if (potentialOutsideNodes.length === 1) {
        //         for (const id of nodes) {
        //             singleEntranceNodes[id] = potentialOutsideNodes[0].skill;
        //         }
        //     }
        // }

        // for (const desiredNode of desiredNodes) {
        //     if (singleEntranceNodes[desiredNode.id]) {
        //         desiredGroupDistances[singleEntranceNodes[desiredNode.id]] = 0;
        //     }
        // }



        const travelNodes = Object.values(this.skillTreeData.nodes).filter(node => this.skillTreeData.tree === 'Default' ? node.isRegular1 : (node.isRegular2 && node.stats.some(stat => travelStats.includes(stat.toLowerCase()))));

        for (const travelNode of travelNodes) {
            desiredGroupDistances[travelNode.id] = desiredGroupDistances[travelNode.id] !== undefined ? desiredGroupDistances[travelNode.id] * desiredAdjustment : 1 - desiredAdjustment;
        }


        if (this.skillTreeData.tree.slice(0, 5) === 'Atlas') {
            const contentTypes = ['Alva', 'Anarchy', 'Bestiary', 'Beyond', 'Blight', 'Breach', 'CleansingFire', 'Conqueror',
                'Delirium', 'Delve', 'Domination', 'ElderShaper', 'Essence', 'Expedition', 'Harbinger', 'Harvest', 'Heist',
                'Jun', 'Kirac', 'Labyrinth', 'Legion', 'Map', 'Metamorph', 'Necropolis', 'Ritual', 'Scarab', 'Sextant', 'Strongbox', 'Synthesis',
                'Tangle', 'Torment', 'Vaal']

            for (const contentType of contentTypes) {
                if (desiredNodesUnsorted.filter(node => node.GetIcon().toLowerCase().indexOf(contentType.toLowerCase()) > -1 && node.GetIcon().toLowerCase().indexOf('wheelofdisabling') === -1).filter(node => !travelNodes.includes(node)).length > 0) {
                    const desiredInContent = Object.values(this.skillTreeData.nodes).filter(node => node.GetIcon().toLowerCase().indexOf(contentType.toLowerCase()) > -1 && node.GetIcon().toLowerCase().indexOf('wheelofdisabling') === -1).filter(node => !travelNodes.includes(node))

                    for (const contentNode of desiredInContent) {
                        desiredGroupDistances[contentNode.id] = desiredGroupDistances[contentNode.id] !== undefined ? desiredGroupDistances[contentNode.id] - (2 * desiredAdjustment) : 1 - (2 * desiredAdjustment);
                    }
                }
            }


            // for (const node of Object.values(this.skillTreeData.nodes).filter(node => node.isWormhole)) {
            //     desiredGroupDistances[node.id] = 1.50;
            // }
        }

        if (nodeGroups.length > 1) {
            let count = 0
            let firstRun = true;
            while (nodeGroups.length > 1) {
                if (debug) console.log('Groups length: ' + nodeGroups.length)
                if (++count > 200) {
                    console.log('Infinite loop detection triggered. Please report this as a bug.')
                    break;
                }

                const paths: SkillNode[][] = [];

                const groupsToCheck = nodeGroups.length > 2 ? nodeGroups.filter(group => !group.some(node => node.classStartIndex !== undefined)) : nodeGroups;
                const nonMasteriesLeft = groupsToCheck.some(group => group.every(node => !node.isMastery))

                for (const group of groupsToCheck) {

                    if ((nonMasteriesLeft && group.length === 1) && (group[0].isMastery && [...new Set([...group[0].in, ...group[0].out])].map(id => this.skillTreeData.nodes[id]).some(adjacent => adjacent.is(SkillNodeStates.Active) || adjacent.is(SkillNodeStates.Desired))))
                        continue;
                    const newPaths = shortestPathAlgorithm.Execute(this.skillTreeData, group, desiredGroupDistances, false);
                    for (const path of newPaths) {
                        if (path.length > 0)
                            paths.push(path);
                        if (debug) console.log(path.map(node => node.GetId()).join(', '))
                    }

                }

                const occurences: { [id: number]: number } = {};

                for (const path of paths) {
                    for (const node of path) {
                        if (path.indexOf(node) !== 0 && path.indexOf(node) !== path.length - 1) {
                            occurences[node.skill] = occurences[node.skill] ? occurences[node.skill] + 1 : 1
                        } else {
                            {
                                occurences[node.skill] = occurences[node.skill] ? occurences[node.skill] : 0;
                            }
                        }
                    }
                }

                function compareOccurences(a: SkillNode[], b: SkillNode[]) {
                    let sumA = a.reduce((previousSum, currentNode) => previousSum + occurences[currentNode.skill], 0) / (a.length - 2);
                    let sumB = b.reduce((previousSum, currentNode) => previousSum + occurences[currentNode.skill], 0) / (b.length - 2);

                    if (sumA === undefined || sumB === undefined) return 0;
                    if (sumA < sumB) return 1;
                    if (sumA > sumB) return -1;
                    return 0;
                }


                function compareLengths(a: SkillNode[], b: SkillNode[]) {
                    let sumA = a.length;
                    let aWormholes = a.filter(node => node.isWormhole).length
                    let sumB = b.length;
                    let bWormholes = b.filter(node => node.isWormhole).length

                    if(firstRun){
                        let aClassStart = a.some(node => node.classStartIndex !== undefined);
                        let bClassStart = b.some(node => node.classStartIndex !== undefined);
                        if(aClassStart && bClassStart) return 0;
                        if(aClassStart && !bClassStart) return 1;
                        if(!aClassStart && bClassStart) return -1;
                    }

                    if (sumA === undefined || sumB === undefined) return 0;
                    if (sumA < sumB) return -1;
                    if (sumA > sumB) return 1;
                    if(aWormholes < bWormholes) return -1;
                    if(aWormholes > bWormholes) return 1;
                    return 0;
                }
                paths.sort(compareOccurences)
                paths.sort(compareLengths)

                if(groupsToCheck.filter(group => group.some(node => node.classStartIndex !== -1)).length === 1) firstRun = false;

                if (paths.length == 0) {
                    if (debug) console.log('No paths found')
                    break;
                }

                let shortestPath = paths.shift()
                if (shortestPath === undefined) {
                    if (debug) console.log('Shortest path undefined')
                    return;
                }

                //First node in path is always the first node in the origin group that was checked for the path, which is always active
                const groupNode = shortestPath.shift();
                if (groupNode === undefined) {
                    if (debug) console.log('First node in path undefined')
                    return;
                }
                if (debug) console.log(groupNode.GetId(), shortestPath.map(node => node.GetId()).join(', '))

                if (!groupNode.is(SkillNodeStates.Active)) {
                    if (debug) console.log('Added', groupNode.id, '(' + groupNode.name + ')')
                    this.skillTreeData.addState(groupNode, SkillNodeStates.Active);
                }

                for (const node of shortestPath) {
                    if (!node.is(SkillNodeStates.Active)) {
                        if (debug) console.log('Added', node.id, '(' + node.name + ')')
                        this.skillTreeData.addState(node, SkillNodeStates.Active);
                    }
                }

                const lastNode = shortestPath![shortestPath!.length - 1];
                if (debug) console.log('lastNode ' + lastNode.GetId())

                if (debug) console.log('Groups before merge ' + nodeGroups.length)

                // const originGroup = nodeGroups.splice(nodeGroups.findIndex(group => group.includes(groupNode)))[0];
                // const targetGroup = nodeGroups.splice(nodeGroups.findIndex(group => group.includes(lastNode)))[0];

                const originGroup = nodeGroups.find((group => group.includes(groupNode)))
                const targetGroup = nodeGroups.find((group => group.includes(lastNode)))
                if (originGroup === undefined || targetGroup === undefined) {
                    console.log(nodeGroups)
                    console.log(originGroup, groupNode)
                    console.log(targetGroup, lastNode)
                    return;
                }
                const mergedGroup = this.mergeGroups(originGroup, targetGroup);
                nodeGroups = nodeGroups.filter(group => group.map(node => node.skill).sort().join(',') !== originGroup.map(node => node.skill).sort().join(',') && group.map(node => node.skill).sort().join(',') != targetGroup.map(node => node.skill).sort().join(','));
                if (debug) console.log(nodeGroups, originGroup, targetGroup)

                const pathNodes = shortestPath.filter(node => ![...mergedGroup].includes(node))

                const newGroup = [...mergedGroup, ...pathNodes];
                nodeGroups.push(newGroup);
            }
        }

        // //Handle nodes connected through a mastery
        // const shortestPathAlgo = new ShortestPathAlgorithm();
        // const desiredMasteries = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Desired)).filter(node => node.isMastery)

        // for(const mastery of desiredMasteries){
        //     const adjacentDesireds = [...new Set([...mastery.in, ...mastery.out])].filter(id => this.skillTreeData.nodes[id].is(SkillNodeStates.Desired));
        //     for(const adjacentId of adjacentDesireds){
        //         const adjacentNode = this.skillTreeData.nodes[adjacentId]
        //         const ophaned = [...new Set([...adjacentNode.in, ...adjacentNode.out])].some(id => !this.skillTreeData.nodes[id].is(SkillNodeStates.Desired) && this.skillTreeData.nodes[id].is(SkillNodeStates.Active));
        //     }
        // }

        // //Cull extra nodes
        // const requiredNodes: { [id: string]: SkillNode } = {};


        // //Find definitely required unbranching paths
        // let frontier = [...desiredNodesUnsorted]
        // const explored: { [id: string]: SkillNode } = {};
        // while (frontier.length > 0) {
        //     const currentNode = frontier.shift();
        //     if (currentNode === undefined) break;
        //     explored[currentNode.GetId()] = currentNode
        //     requiredNodes[currentNode.GetId()] = currentNode

        //     const adjacent = [...new Set([...currentNode.out, ...currentNode.in])]
        //         .filter(id => !explored[id])
        //         .map(id => this.skillTreeData.nodes[id])
        //         .filter(node => node.is(SkillNodeStates.Active))

        //     //Abort path check when more than one path is found
        //     if (adjacent.length > 1) continue;

        //     for (const node of adjacent) {
        //         if (explored[node.GetId()]) continue;
        //         frontier.push(node);
        //     }
        // }

        // if (Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).length <= 1) return;

        // const startNodeIds = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active))
        //     .filter(node => node.classStartIndex !== undefined)[0]?.out
        //     .filter(nodeId => this.skillTreeData.nodes[nodeId].is(SkillNodeStates.Active))
        //     .map(id => this.skillTreeData.nodes[id])

        // for (const start of startNodeIds) {
        //     requiredNodes[start.GetId()] = start;
        // }

        // let notRequiredNodes = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active))
        //     .filter(node => !requiredNodes[node.GetId()])

        // for (const node of notRequiredNodes) {
        //     //console.log('Checking ' + node.GetId())
        //     let frontier = [...startNodeIds]
        //     const explored2: { [id: string]: SkillNode } = {};
        //     while (frontier.length > 0) {
        //         const currentNode = frontier.shift();
        //         if (currentNode === undefined) break;
        //         explored2[currentNode.GetId()] = currentNode

        //         const adjacent = [...new Set([...currentNode.out, ...currentNode.in])]
        //             .filter(id => !explored2[id])
        //             .map(id => this.skillTreeData.nodes[id])
        //             .filter(node => node.is(SkillNodeStates.Active))
        //             .filter(adjacentNode => adjacentNode.GetId() !== node.GetId())

        //         for (const node of adjacent) {
        //             if (explored2[node.GetId()]) continue;
        //             frontier.unshift(node);
        //         }
        //     }

        //     let allDesiredFound = true;
        //     for (const desired of desiredNodesUnsorted) {
        //         if (!explored2[desired.GetId()]) {
        //             //console.log("Didn't find " + desired.GetId() + " because of " + node.GetId())
        //             allDesiredFound = false;
        //             break;
        //         }
        //     }

        //     if (!allDesiredFound) {
        //         //console.log('Adding to required ' + node.GetId()) 
        //         requiredNodes[node.GetId()] = node;
        //     } else {
        //         const yeeted = node;
        //         if (yeeted === undefined) break;
        //         this.skillTreeData.removeState(yeeted, SkillNodeStates.Active)
        //         if (debug) console.log('Yeeted ' + yeeted?.GetId())
        //     }
        // }

    }

    private mergeGroups = (originGroup: SkillNode[], targetGroup: SkillNode[]): SkillNode[] => {
        if (originGroup === undefined || targetGroup === undefined) {
            console.log('Group undefined')
            console.log(originGroup)
            console.log(targetGroup)
            return new Array<SkillNode>();
        }

        return [...originGroup, ...targetGroup];

    }

    private adjustDesiredGroupDistances = (desiredNodes: Array<SkillNode>, adjustment: number): { [nodeId: string]: number } => {
        const nodeDistanceWeights: { [nodeId: string]: number } = {}

        function getDistance(x1: number, y1: number, x2: number, y2: number) {
            const x = x2 - x1
            const y = y2 - y1

            return Math.sqrt(x * x + y * y)
        }

        for (const node of desiredNodes) {
            const groupId = node.group
            if (groupId === undefined) continue
            const group = this.skillTreeData.groups[groupId]
            const nodeIds = group.nodes
            let furthestDistance = 0
            let totalX = 0, totalY = 0;
            let masteryType = ''
            for (const nodeId of nodeIds) {
                const node = this.skillTreeData.nodes[nodeId]
                if (node.isMastery) masteryType = node.name
                totalX += node.x;
                totalY += node.y;
            }

            const centerX = totalX / nodeIds.length;
            const centerY = totalY / nodeIds.length;
            const debug = false//node.skill === 17015
            for (const nodeId of nodeIds) {
                const node = this.skillTreeData.nodes[nodeId]
                if (node.name === 'Map Drop Duplication' || node.name === 'Adjacent Map Drop Chance') continue
                if (debug) console.log(node.name)
                const distance = getDistance(centerX, centerY, node.x, node.y)
                furthestDistance = distance > furthestDistance ? distance : furthestDistance;
            }
            const nodesInRange = this.skillTreeData.getNodesInRange(centerX, centerY, furthestDistance * 1.05);
            for (const node of nodesInRange) {
                let wrongMastery = false
                if (masteryType != '' && node.group && node.group !== groupId) {
                    for (const newGroupNodeId of this.skillTreeData.groups[node.group].nodes) {
                        const newGroupNode = this.skillTreeData.nodes[newGroupNodeId]
                        if (newGroupNode.isMastery && newGroupNode.name !== masteryType) wrongMastery = true
                    }
                }
                if (wrongMastery) continue;
                nodeDistanceWeights[node.id] = 1 - adjustment
            }
        }

        return nodeDistanceWeights
    }
}