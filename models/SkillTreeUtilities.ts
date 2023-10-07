import { SkillTreeData } from "./SkillTreeData";
import { SkillNode, SkillNodeStates } from "./SkillNode";
import { SkillTreeEvents } from "./SkillTreeEvents";
import * as PIXI from "pixi.js";
import { SkillTreeCodec } from "./SkillTreeCodec";
import { sleep } from "bun";
import { beforeAll } from "bun:test";

export class SkillTreeUtilities {
    private dragStart: PIXI.Point;
    private dragEnd: PIXI.Point;
    private DRAG_THRESHOLD_SQUARED = 5 * 5;
    private LONG_PRESS_THRESHOLD = 100;
    skillTreeData: SkillTreeData;
    skillTreeDataCompare: SkillTreeData | undefined;
    skillTreeCodec: SkillTreeCodec;

    constructor(context: SkillTreeData, contextComapre: SkillTreeData | undefined) {
        this.skillTreeData = context;
        this.skillTreeDataCompare = contextComapre;
        this.skillTreeCodec = new SkillTreeCodec();

        SkillTreeEvents.on("node", "click", this.click);
        SkillTreeEvents.on("node", "tap", this.click);
        SkillTreeEvents.on("node", "mouseover", this.mouseover);
        SkillTreeEvents.on("node", "mouseout", this.mouseout);
        SkillTreeEvents.on("node", "touchstart", this.touchstart);
        SkillTreeEvents.on("node", "touchend", this.touchend);
        SkillTreeEvents.on("node", "touchcancel", this.touchend);

        this.dragStart = new PIXI.Point(0, 0);
        this.dragEnd = new PIXI.Point(0, 0);
        SkillTreeEvents.on("viewport", "drag-start", (point: PIXI.IPoint) => this.dragStart = JSON.parse(JSON.stringify(point)));
        SkillTreeEvents.on("viewport", "drag-end", (point: PIXI.IPoint) => this.dragEnd = JSON.parse(JSON.stringify(point)));
        SkillTreeEvents.on("viewport", "mouseup", () => setTimeout(() => this.dragStart = JSON.parse(JSON.stringify(this.dragEnd)), 250));
        SkillTreeEvents.on("viewport", "touchend", () => setTimeout(() => this.dragStart = JSON.parse(JSON.stringify(this.dragEnd)), 250));
        SkillTreeEvents.on("viewport", "touchcancel", () => setTimeout(() => this.dragStart = JSON.parse(JSON.stringify(this.dragEnd)), 250));

        SkillTreeEvents.on("controls", "class-change", this.changeStartClass);
        SkillTreeEvents.on("controls", "ascendancy-class-change", this.changeAscendancyClass);
        SkillTreeEvents.on("controls", "search-change", this.searchChange);

        SkillTreeEvents.on("skilltree", "encode-url", () => window.location.hash = '#' + this.encodeURL(true));
    }

    private lastHash = "";
    public decodeURL = (allocated: boolean) => {
        if (this.lastHash === window.location.hash) {
            return;
        }
        this.lastHash = window.location.hash;

        try {
            const data = window.location.hash.replace("#", "");
            if (data === null) {
                window.location.hash = "";
                return;
            }

            const def = this.skillTreeCodec.decodeURL(data, this.skillTreeData, allocated);
            this.skillTreeData.version = def.Version;
            this.skillTreeData.fullscreen = def.Fullscreen;
            this.changeStartClass(def.Class, false);
            this.changeAscendancyClass(def.Ascendancy, false);
            for (const node of def.Nodes) {
                this.skillTreeData.addStateById(`${node.skill}`, SkillNodeStates.Active)
            }
            for (const node of def.Desired) {
                this.skillTreeData.addStateById(`${node.skill}`, SkillNodeStates.Desired)
            }
            for (const node of def.Undesired) {
                this.skillTreeData.addStateById(`${node.skill}`, SkillNodeStates.UnDesired)
            }


            window.location.hash = '#' + this.encodeURL(false);
        }
        catch (ex) {
            window.location.hash = "";
            console.log(ex);
        }
    }

    public encodeURL = (allocated: boolean) => {
        SkillTreeEvents.fire("skilltree", "active-nodes-update");
        this.broadcastSkillCounts();
        return `${this.skillTreeCodec.encodeURL(this.skillTreeData, allocated)}`;
    }

    private broadcastSkillCounts = () => {
        //need to add bandits here
        let maximumNormalPoints = this.skillTreeData.points.totalPoints;
        const maximumAscendancyPoints = this.skillTreeData.points.ascendancyPoints;
        let normalNodes = 0;
        let ascNodes = 0;

        const nodes = this.skillTreeData.getNodes(SkillNodeStates.Active);
        for (const id in nodes) {
            const node = nodes[id];
            if (node.classStartIndex === undefined && !node.isAscendancyStart) {
                if (node.ascendancyName === "") {
                    normalNodes++;
                } else {
                    ascNodes++;
                }
                maximumNormalPoints += node.grantedPassivePoints;
            }
        }

        SkillTreeEvents.fire("skilltree", "normal-node-count", normalNodes);
        SkillTreeEvents.fire("skilltree", "normal-node-count-maximum", maximumNormalPoints);
        SkillTreeEvents.fire("skilltree", "ascendancy-node-count", ascNodes);
        SkillTreeEvents.fire("skilltree", "ascendancy-node-count-maximum", maximumAscendancyPoints);
    }

    public changeStartClass = (start: number, encode = true) => {
        for (const id in this.skillTreeData.classStartNodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.classStartIndex === undefined) {
                continue;
            }

            if (node.classStartIndex !== start) {
                this.skillTreeData.removeState(node, SkillNodeStates.Active);
                continue;
            }

            this.skillTreeData.addState(node, SkillNodeStates.Active);
            SkillTreeEvents.fire("skilltree", "class-change", node);
        }
        (document.getElementById("skillTreeControl_Class") as HTMLSelectElement).value = String(start);
        this.changeAscendancyClass(0, false);
        this.allocateNodes();

        if (encode) {
            window.location.hash = '#' + this.encodeURL(false);
        }        
    }

    public changeAscendancyClass = (start: number, encode = true) => {
        if (this.skillTreeData.classes.length === 0) {
            return;
        }

        const ascClasses = this.skillTreeData.classes[this.skillTreeData.getStartClass()].ascendancies;
        if (ascClasses === undefined) {
            return;
        }

        const ascClass = ascClasses[start];
        const name = ascClass !== undefined ? ascClass.name : undefined;

        const ascControl = (document.getElementById("skillTreeControl_Ascendancy") as HTMLSelectElement);

        while (ascControl.firstChild) {
            ascControl.removeChild(ascControl.firstChild);
        }
        const none = document.createElement("option");
        none.text = "None";
        none.value = "0";
        ascControl.append(none);

        if (this.skillTreeData.classes.length > 0) {
            for (const ascid in ascClasses) {
                const asc = ascClasses[ascid];

                const e = document.createElement("option");
                e.text = asc.name;
                e.value = ascid;

                if (+ascid === start) {
                    e.setAttribute("selected", "selected");
                }
                ascControl.append(e);
            }
        }

        for (const id in this.skillTreeData.ascedancyNodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.ascendancyName !== name) {
                this.skillTreeData.removeState(node, SkillNodeStates.Active);
                this.skillTreeData.removeState(node, SkillNodeStates.Desired);
                continue;
            }
            if (node.isAscendancyStart) {
                this.skillTreeData.addState(node, SkillNodeStates.Active);
                SkillTreeEvents.fire("skilltree", "ascendancy-class-change", node);
                SkillTreeEvents.fire("skilltree", "highlighted-nodes-update");
            }
        }

        if (encode) {
            window.location.hash = '#' + this.encodeURL(false);
        }
    }

    public searchChange = (str: string | undefined = undefined) => {
        this.skillTreeData.clearState(SkillNodeStates.Highlighted);

        if (str !== undefined && str.length !== 0) {
            const regex = new RegExp(str, "gi");
            for (const id in this.skillTreeData.nodes) {
                const node = this.skillTreeData.nodes[id];
                if (node.isAscendancyStart || node.classStartIndex !== undefined) {
                    continue;
                }
                if (node.name.match(regex) !== null || node.stats.find(stat => stat.match(regex) !== null) !== undefined) {
                    this.skillTreeData.addState(node, SkillNodeStates.Highlighted);
                }
            }
        }

        SkillTreeEvents.fire("skilltree", "highlighted-nodes-update");
    }

    private click = (node: SkillNode) => {
        if (node.is(SkillNodeStates.Compared)) {
            return;
        }

        if ((this.dragStart.x - this.dragEnd.x) * (this.dragStart.x - this.dragEnd.x) > this.DRAG_THRESHOLD_SQUARED
            || (this.dragStart.y - this.dragEnd.y) * (this.dragStart.y - this.dragEnd.y) > this.DRAG_THRESHOLD_SQUARED) {
            return;
        }
        if (node.classStartIndex !== undefined || node.isAscendancyStart) {
            return;
        }

        if (node.classStartIndex !== undefined || node.isAscendancyStart) {
            return;
        }

        if(node.ascendancyName !== "" && Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).filter(node => node.isAscendancyStart)[0].ascendancyName !== node.ascendancyName){
            return
        }

        if (this.skillTreeData.tree === "Atlas" && node.isMastery) {
            let groups: Array<number> = []
            for (const id in this.skillTreeData.nodes) {
                const other = this.skillTreeData.nodes[id];
                if (!other.isMastery) {
                    continue;
                }

                if (other.name !== node.name) {
                    continue;
                }

                if (other.group === undefined) {
                    continue;
                }

                if(!groups.includes(other.group)){
                    groups.push(other.group)
                }
            }
            for(const groupId of groups){
                for(const nodeId of this.skillTreeData.groups[groupId].nodes){
                    const node = this.skillTreeData.nodes[nodeId]
                    if(node.isNotable){                        
                        if (node.is(SkillNodeStates.Desired)) {
                            this.skillTreeData.removeState(node, SkillNodeStates.Desired);
                            this.skillTreeData.addState(node, SkillNodeStates.UnDesired);
                        }
                        else if (node.is(SkillNodeStates.UnDesired)){
                            this.skillTreeData.removeState(node, SkillNodeStates.UnDesired);
                        }
                        else if (!node.isMastery) {
                            this.skillTreeData.addState(node, SkillNodeStates.Desired);
                        }
                        SkillTreeEvents.fire("skilltree", "highlighted-nodes-update");
                    }
                }
            }
        }
        else{
            if (node.is(SkillNodeStates.Desired)) {
                this.skillTreeData.removeState(node, SkillNodeStates.Desired);
                this.skillTreeData.addState(node, SkillNodeStates.UnDesired);
            }
            else if (node.is(SkillNodeStates.UnDesired)){
                this.skillTreeData.removeState(node, SkillNodeStates.UnDesired);
            }
            else if (!node.isMastery) {
                this.skillTreeData.addState(node, SkillNodeStates.Desired);
            }
            SkillTreeEvents.fire("skilltree", "highlighted-nodes-update");
        }
        
        
        this.allocateNodes();
    }

    public allocateNodes = () => {
        const debug = false
        const nodesToDisable = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).filter(node => node.classStartIndex === undefined && !node.isAscendancyStart)
        for (const node of nodesToDisable){
            this.skillTreeData.removeState(node, SkillNodeStates.Active);
        }
        
        const startNodes = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active))
        .filter(node => node.classStartIndex !== undefined)[0].out
        .filter(nodeId => this.skillTreeData.nodes[nodeId].isAscendancyStart === false)
        .map(nodeId => this.skillTreeData.nodes[nodeId])
        .filter(node => !node.is(SkillNodeStates.UnDesired));
        const desiredNodesUnsorted = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Desired))
        let desiredNodes = desiredNodesUnsorted.sort((b,a) => 
        {
            let distanceA = 100
            let distanceB = 100

            for(const node of startNodes){
                const distA = this.skillTreeData.nodes[a.GetId()].distance[node.GetId()]
                const distB = this.skillTreeData.nodes[b.GetId()].distance[node.GetId()]

                if(distA === undefined || distB === undefined)
                    return -1

                distanceA = distA < distanceA ? distA : distanceA;
                distanceB = distB < distanceB ? distB : distanceB;
            }
            if(distanceA < distanceB)    
                return -1
            if(distanceA > distanceB)
                return 1

            return 0
        });
        

        if(desiredNodes.length > 0){
            let count = 0
            while (desiredNodes.length > 0){
                if(++count > 100){
                    console.log('Infinite loop detection triggered. Please report this as a bug.')
                    break;
                }

                const paths: Array<{ id: string, path: Array<SkillNode> }> = [];
                for(const node of desiredNodes){
                    const id = node.GetId();
                    const path = this.getShortestPath(node, debug);
                    paths.push({id, path})
                }
                if(paths.length == 0){
                    if(debug) console.log('No paths found')
                    break;
                }
                paths.sort((a,b) => a.path.length - b.path.length)
                const shortestPath = paths.shift()
                if (shortestPath === undefined){
                    if(debug) console.log('Shortest path undefined')
                    return;
                }
                    
                const shortestPathNode = this.skillTreeData.nodes[shortestPath.id]
                if (!shortestPathNode.is(SkillNodeStates.Active)) {
                    if(debug) console.log('Added', shortestPathNode.id, '(' + shortestPathNode.name + ')')
                    this.skillTreeData.addState(shortestPathNode, SkillNodeStates.Active);
                }
                
                for (const i of shortestPath.path) {
                    if (!i.is(SkillNodeStates.Active)) {
                        if(debug) console.log('Added', i.id, '(' + i.name + ')')
                        this.skillTreeData.addState(i, SkillNodeStates.Active);
                    }
                }

                desiredNodes = desiredNodes.filter(node => !node.is(SkillNodeStates.Active))
                
                if(desiredNodes.length === 0){
                    this.addRoot(startNodes, debug)
                }
            }
        }

        this.skillTreeData.clearState(SkillNodeStates.Hovered);
        this.skillTreeData.clearState(SkillNodeStates.Pathing);
        this.skillTreeDataCompare?.clearState(SkillNodeStates.Hovered);
        window.location.hash = '#' + this.encodeURL(false);
    }

    private addRoot = (startNodes: Array<SkillNode>, debug: boolean) => {
        if(debug) console.log('Finding root!')
        let closestNode
        let closestNodeDist = 10000
        let alreadyHaveRoot = false
        for(const node of Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).filter(node => node.classStartIndex === undefined)){
            for (const startNode of startNodes){
                if(debug) console.log('Checking ' + node.id + ' against ' + startNode.id)
                if(node.GetId() === startNode.GetId()) {
                    alreadyHaveRoot = true;
                    if(debug) console.log('Already have root')
                    break;
                }
                const dist = this.skillTreeData.nodes[node.GetId()].distance[startNode.GetId()]
                if(debug) console.log('For node ' + node.name + ' the distance to ' + startNode.name + ' is ' + dist)
                if(dist < closestNodeDist){
                    
                    closestNode = startNode;
                    closestNodeDist = dist;
                }
            }
            if (alreadyHaveRoot){
                if(debug)console.log('Already have root')
                break;
            } 
        }
        
        if(closestNode !== undefined && !alreadyHaveRoot){
            let rootNodeAllocated = false;
            for (const startNode of startNodes){
                const outNodes = startNode.out.map(n => this.skillTreeData.nodes[n]).filter(node => node.ascendancyName === "" && node.classStartIndex === undefined)

                for(const node of outNodes){
                    if(node.is(SkillNodeStates.Active)){
                        if(debug) console.log('Added', startNode.id, '(' + startNode.name + ')')
                        this.skillTreeData.addState(startNode, SkillNodeStates.Active);
                        if(debug) console.log('Allocated root node')
                        rootNodeAllocated = true;
                    }
                }
            }

            if (rootNodeAllocated) return;

            let path = this.getShortestPath(closestNode, debug)
            if(debug) console.log('Root path 1 is', path)
            if(debug) console.log(path.length, closestNode)

            if(path.length === 0){
                for (const startNode of startNodes){
                    if(debug) console.log('Checking ' + startNode.id)
                    const newPath = this.getShortestPath(startNode, debug);
                    if(debug) console.log('New Path', newPath)
                    
                    if(path.length === 0 || (newPath.length < path.length && newPath.length > 0)){
                        if(debug) console.log('path, newPath', path.length, newPath.length)
                        closestNode = startNode;
                        path = newPath;
                        if(debug) console.log('Replacing path',path.length, closestNode)
                    }
                }
            }

            if(debug) console.log('Root path 2 is', path)

            if(path.length === 0){
                const previousActiveNodes = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).filter(node => node.classStartIndex === undefined && node.ascendancyName === "")
                if(debug) console.log('Clearing nodes')
                for (const node of previousActiveNodes){
                    this.skillTreeData.removeState(node, SkillNodeStates.Active);
                }

                return;
            }

            if (!closestNode.is(SkillNodeStates.Active)) {
                if(debug) console.log('Added', closestNode.id, '(' + closestNode.name + ')')
                this.skillTreeData.addState(closestNode, SkillNodeStates.Active);
            }

            for (const i of path) {
                if (!i.is(SkillNodeStates.Active)) {
                    if(debug) console.log('Added', i.id, '(' + i.name + ')')
                    this.skillTreeData.addState(i, SkillNodeStates.Active);
                }
            }
        }
        
    }

    private touchTimeout: Timer | null = null;
    private touchstart = (node: SkillNode) => {
        this.touchTimeout = setTimeout(() => this.dragEnd.x = this.dragStart.x + this.DRAG_THRESHOLD_SQUARED * this.DRAG_THRESHOLD_SQUARED, this.LONG_PRESS_THRESHOLD);
        this.mouseover(node);
    }

    private touchend = (node: SkillNode) => {
        if (this.touchTimeout !== null) {
            clearTimeout(this.touchTimeout);
        }
        this.mouseout(node);
    }

    private mouseover = (node: SkillNode) => {
        this.skillTreeData.clearState(SkillNodeStates.Hovered);
        this.skillTreeData.clearState(SkillNodeStates.Pathing);
        this.skillTreeDataCompare?.clearState(SkillNodeStates.Hovered);

        if (node.classStartIndex === undefined) {
            if (node.is(SkillNodeStates.Compared)) {
                this.skillTreeDataCompare?.addState(node, SkillNodeStates.Hovered);
            } else {
                this.skillTreeData.addState(node, SkillNodeStates.Hovered);

                if (this.skillTreeData.tree === "Atlas" && node.isMastery) {
                    for (const id in this.skillTreeData.nodes) {
                        const other = this.skillTreeData.nodes[id];
                        if (!other.isMastery) {
                            continue;
                        }

                        if (other.name !== node.name) {
                            continue;
                        }

                        this.skillTreeData.addState(other, SkillNodeStates.Hovered);
                    }
                }
            }
        }
        const shortest = this.getShortestPath(node, false);
        for (const i of shortest) {
            if (!i.is(SkillNodeStates.Pathing) && !i.is(SkillNodeStates.Active)) {
                this.skillTreeData.addState(i, SkillNodeStates.Pathing);
            }
        }
        node.hoverText = shortest.length.toString();

        SkillTreeEvents.fire("skilltree", "hovered-nodes-start", node);
    }

    private mouseout = (node: SkillNode) => {
        this.skillTreeData.clearState(SkillNodeStates.Hovered);
        this.skillTreeData.clearState(SkillNodeStates.Pathing);
        this.skillTreeDataCompare?.clearState(SkillNodeStates.Hovered);
        SkillTreeEvents.fire("skilltree", "hovered-nodes-end", node);
    }

    private getShortestPath = (target: SkillNode, wantDebug: boolean): Array<SkillNode> => {
        const numberActive = Object.values(this.skillTreeData.getNodes(SkillNodeStates.Active)).map(node => node.id).length
        //wantDebug = wantDebug && target.id === '5616'
        if (target.is(SkillNodeStates.Active)){
            if(wantDebug) console.log('Early return 1')
            return new Array<SkillNode>;
        }
        if (target.isBlighted) {
            if(wantDebug) console.log('Early return 2')
            return new Array<SkillNode>(target);
        }
        let foundNode: SkillNode = target;
        const frontier: Array<SkillNode> = [];
        const distance: { [id: string]: number } = {};
        const adjacent = this.getAdjacentNodes([target.GetId()]);
        for (const id in adjacent) {
            const node = adjacent[id];
            if ((node.classStartIndex !== undefined || node.isAscendancyStart) && !node.is(SkillNodeStates.Active)) {
                continue;
            }
            if (node.is(SkillNodeStates.UnDesired)){
                continue;
            }
            frontier.push(adjacent[id]);
            distance[id] = node.classStartIndex ? 0 : 1;
        }


        const explored: { [id: string]: SkillNode } = {};
        explored[target.GetId()] = target;
        const prev: { [id: string]: SkillNode } = {};
        while (frontier.length > 0) {
            const current2 = frontier.shift();
            if (current2 === undefined) {
                if(wantDebug) console.log('Early return 3')
                break;
            }
            if(wantDebug) console.log('Current frontier ID', current2.GetId())

            explored[current2.GetId()] = current2;
            const dist = distance[current2.GetId()];
            let count = 0
            for (const id of current2.out) {
                if(++count > 20) break;
                if(wantDebug) console.log('Current out ID', id)
                const out = this.skillTreeData.nodes[id];
                if ((current2.ascendancyName === "" && out.ascendancyName !== "" && !out.is(SkillNodeStates.Active))
                    || (current2.ascendancyName !== "" && out.ascendancyName === "" && !current2.is(SkillNodeStates.Active))) {
                    continue;
                }
                if (explored[id] || distance[id]) {
                    continue;
                }
                if ((out.classStartIndex !== undefined || out.isAscendancyStart) && !out.is(SkillNodeStates.Active)) {
                    continue;
                }
                
                if (out.is(SkillNodeStates.UnDesired)) {
                    continue;
                }
                
                if(wantDebug) console.log('Adding out node to frontier')
                distance[id] = dist + (out.classStartIndex ? 0 : 1);
                prev[id] = current2;
                frontier.push(out);
                if(wantDebug) console.log('New frontier', frontier.map(node => node.GetId()))
                if(wantDebug) console.log('Is out active?', out.is(SkillNodeStates.Active))
                if (out.is(SkillNodeStates.Active || (numberActive === 0 && out.is(SkillNodeStates.Desired))) /*|| startNodes.map(node => node.id).includes(out.id)*/) {
                    frontier.length = 0;
                    foundNode = out;
                    break;
                }
            }
        }

        if(wantDebug) console.log('Found node', foundNode, foundNode === target, distance[foundNode.GetId()])
        if (foundNode === target || distance[foundNode.GetId()] === undefined) {
            return new Array<SkillNode>();
        }
        let current: SkillNode | undefined = foundNode;
        const path = new Array<SkillNode>();
        while (current !== undefined) {
            path.push(current);
            current = prev[current.GetId()];
        }
        return path.reverse();
    }

    private getAdjacentNodes = (nodeIds: Array<string>) => {
        const adjacentNodes: { [id: string]: SkillNode } = {};
        for (const parentId of nodeIds) {
            for (const id of this.skillTreeData.nodes[parentId].out) {
                const out = this.skillTreeData.nodes[id];
                if (out.classStartIndex !== undefined && !out.is(SkillNodeStates.Active)) {
                    continue;
                }
                adjacentNodes[id] = out;
            }
        }
        return adjacentNodes;
    }
}