﻿import { SkillTreeData } from './SkillTreeData';
import Viewport = require("pixi-viewport");
import PIXI = require("pixi.js");
import { utils } from "../app/utils";
import { SkillTreeEvents } from "./SkillTreeEvents";
import { SkillNodeStates, SkillNode, ConnectionStyle } from "./SkillNode";
import { PIXISkillNodeRenderer } from "./PIXISkillNodeRenderer";
import { SpatialHash } from 'pixi-cull';
import { BaseSkillTreeRenderer, RenderLayer, IAsset, IHighlight } from "./BaseSkillTreeRenderer";
import { IConnnection } from "./types/IConnection";

export class PIXISkillTreeRenderer extends BaseSkillTreeRenderer {
    SkillNodeRenderer: PIXISkillNodeRenderer;

    private _dirty = true;
    private pixi: PIXI.Application;
    private viewport: Viewport.Viewport;
    private cull: SpatialHash;
    private DO_NOT_CULL = [RenderLayer.Tooltip, RenderLayer.TooltipCompare];
    LayerContainers: { [layer in RenderLayer]: PIXI.Container } = {
        [RenderLayer.BackgroundColor]: new PIXI.Container(),
        [RenderLayer.Background]: new PIXI.Container(),
        [RenderLayer.BackgroundActive]: new PIXI.Container(),
        [RenderLayer.Connections]: new PIXI.Container(),
        [RenderLayer.SkillIconsActiveEffects]: new PIXI.Container(),
        [RenderLayer.ConnectionsActive]: new PIXI.Container(),
        [RenderLayer.ConnectionsPathing]: new PIXI.Container(),
        [RenderLayer.SkillIcons]: new PIXI.Container(),
        [RenderLayer.SkillIconsPathing]: new PIXI.Container(),
        [RenderLayer.SkillIconsActive]: new PIXI.Container(),
        [RenderLayer.CharacterStarts]: new PIXI.Container(),
        [RenderLayer.CharacterStartsActive]: new PIXI.Container(),
        [RenderLayer.JewelSocketActive]: new PIXI.Container(),
        [RenderLayer.JewelSocketHighlights]: new PIXI.Container(),
        [RenderLayer.SkillIconsCompare]: new PIXI.Container(),
        [RenderLayer.Highlights]: new PIXI.Container(),
        [RenderLayer.NodeMoveCompare]: new PIXI.Container(),
        [RenderLayer.AtlasMasteryHighlight]: new PIXI.Container(),
        [RenderLayer.Tooltip]: new PIXI.Container(),
        [RenderLayer.TooltipCompare]: new PIXI.Container(),
    };

    constructor(container: HTMLElement, skillTreeData: SkillTreeData, skillTreeDataCompare: SkillTreeData | undefined) {
        super(container, skillTreeData, skillTreeDataCompare);

        this.pixi = new PIXI.Application({ resizeTo: window, resolution: devicePixelRatio, sharedTicker: true });
        PIXI.Ticker.shared.stop();
        PIXI.Ticker.system.stop();
        container.appendChild(this.pixi.view);

        PIXI.settings.SORTABLE_CHILDREN = false;
        PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
        PIXI.settings.ROUND_PIXELS = false;
        PIXI.settings.RESOLUTION = devicePixelRatio;
        PIXI.utils.destroyTextureCache();
        PIXI.Loader.shared.reset();

        this.skillTreeData = skillTreeData;
        this.skillTreeDataCompare = skillTreeDataCompare;

        this.SkillNodeRenderer = new PIXISkillNodeRenderer(this.skillTreeData.skillSprites, this.skillTreeDataCompare !== undefined ? this.skillTreeDataCompare.skillSprites : undefined, this.skillTreeData.imageZoomLevels.length - 1);
        SkillTreeEvents.on("skilltree", "hovered-nodes-end", (node: SkillNode) => this.SkillNodeRenderer.DestroyTooltip(node, "Base"));
        SkillTreeEvents.on("skilltree", "hovered-nodes-end", (node: SkillNode) => this.SkillNodeRenderer.DestroyTooltip(node, "Compare"));

        const zoomPercent = this.skillTreeData.imageZoomLevels.length > 2 ? this.skillTreeData.imageZoomLevels[1] - this.skillTreeData.imageZoomLevels[0] : .1;
        this.viewport = new Viewport.Viewport({
            screenWidth: this.pixi.screen.width,
            screenHeight: this.pixi.screen.height,
            worldWidth: this.skillTreeData.width * (this.skillTreeData.scale * 1.25),
            worldHeight: this.skillTreeData.height * (this.skillTreeData.scale * 1.25),
            interaction: this.pixi.renderer.plugins.interaction,
            noTicker: true,
            stopPropagation: true
        });
        this.viewport.drag().wheel({ percent: zoomPercent }).pinch({ percent: zoomPercent * 10 });
        this.viewport.clampZoom({ minWidth: this.skillTreeData.width * (zoomPercent / 8), minHeight: this.skillTreeData.height * (zoomPercent / 8) });
        this.viewport.fitWorld(true);
        this.viewport.zoomPercent(1.726);

        this.viewport.on('drag-start', (data) => SkillTreeEvents.fire("viewport", "drag-start", data.world));
        this.viewport.on('drag-end', (data) => SkillTreeEvents.fire("viewport", "drag-end", data.world));
        this.viewport.on('mouseup', () => SkillTreeEvents.fire("viewport", "mouseup"));
        this.viewport.on('touchend', () => SkillTreeEvents.fire("viewport", "touchend"));
        this.viewport.on('touchcancel', () => SkillTreeEvents.fire("viewport", "touchcancel"));
        this.viewport.on('click', (click) => this.HandleZoomClick(click, zoomPercent * 2));
        this.viewport.on('click', this.HandleShiftClick);
        this.viewport.on('rightclick', (click) => this.HandleZoomClick(click, -zoomPercent * 2));

        this.pixi.stage.addChild(this.viewport);

        window.onresize = () => {
            this.pixi.renderer.resize(window.innerWidth, window.innerHeight);
            this.viewport.resize(this.pixi.renderer.width, this.pixi.renderer.height, this.skillTreeData.width * (this.skillTreeData.scale * 1.25), this.skillTreeData.height * (this.skillTreeData.scale * 1.25));
            this.viewport.clampZoom({ minWidth: this.skillTreeData.width * (zoomPercent / 8), minHeight: this.skillTreeData.height * (zoomPercent / 8) });
        };

        this.cull = new SpatialHash({ size: 512 });

        super.Tick();
    }

    IsDirty(): boolean {
        return this._dirty || this.viewport.dirty;
    }

    PreUpdate(delta: number): void {
        this.viewport.update(delta);
    }

    Update(_: number): void {
        this.cull.cull(this.viewport.getVisibleBounds());
        this.pixi.render();
        this._dirty = this.viewport.dirty = false;
    }

    PostUpdate(_: number): void { }

    protected SetupLayers() {
        this.viewport.removeChildren();

        for (const key in this.LayerContainers) {
            const layer = Number(key) as RenderLayer;
            const object = this.LayerContainers[layer];

            if (this.DO_NOT_CULL.indexOf(layer) === -1) {
                this.cull.addContainer(object);
            }

            this.viewport.addChild(object);
        }
    }

    protected SetLayer(layer: RenderLayer, object: PIXI.Container) {
        this._dirty = true;
        this.LayerContainers[layer] = object;

        const current = this.viewport.getChildAt(layer) as PIXI.Container;
        if (this.DO_NOT_CULL.indexOf(layer) === -1) {
            this.cull.removeContainer(current);
        }

        if (this.DO_NOT_CULL.indexOf(layer) === -1) {
            this.cull.addContainer(object);
        }

        if (object === current) {
            return;
        }

        this.viewport.addChild(object);
        this.viewport.swapChildren(current, object);
        this.viewport.removeChild(current);
    }

    protected GetLayer(layer: RenderLayer): PIXI.Container {
        return this.viewport.getChildAt(layer) as PIXI.Container;
    }

    protected ClearLayer(layer: RenderLayer) {
        this.SetLayer(layer, new PIXI.Container());
    }

    async Initialize(): Promise<boolean> {
        if (this.Initialized) {
            return true;
        }

        await this.LoadAssets([this.skillTreeData, this.skillTreeDataCompare]);
        this.Initialized = true;

        return this.SkillNodeRenderer.Initialize();
    }

    private HandleZoomClick = (click: PIXI.InteractionEvent, zoom: number) => {
        if (!click.data.originalEvent.ctrlKey) {
            return;
        }

        this.viewport.zoomPercent(zoom, false);
    }

    private HandleShiftClick = (click: PIXI.InteractionEvent) => {
        if (!click.data.originalEvent.shiftKey) {
            return;
        }

        const interactiveObject = this.pixi.renderer.plugins.interaction.hitTest(click.data.global, this.viewport.getChildAt(RenderLayer.SkillIcons));
        if (interactiveObject === null || interactiveObject.name === undefined || interactiveObject.name === null || interactiveObject.name === "") {
            return;
        }

        const node = this.skillTreeData.nodes[+interactiveObject.name];
        if (node.isKeystone) {
            return;
        }
    }

    private LoadAssets = (data: (SkillTreeData | undefined)[]): Promise<boolean> => {
        const filteredData = data.filter(utils.NotUndefined);
        if (filteredData.length <= 0) {
            throw new Error("SkillTreeData has not been defined. Could not load assets.");
        }

        const promise = new Promise<boolean>((resolve) => {
            PIXI.Loader.shared.onComplete.add(() => resolve(true));
            //PIXI.Loader.shared.onError.add(() => reject(false));
        });

        // #region Load Assets
        const addedAssets = new Array<string>();
        for (const i of filteredData) {
            for (const id in i.assets) {
                const asset = i.assets[id];
                if ((asset[i.scale] || asset["1"]) && addedAssets.indexOf(id) < 0) {
                    addedAssets.push(id);
                    PIXI.Loader.shared.add(id.replace("PassiveSkillScreen", ""), `${utils.SKILL_TREES_URI}/${i.patch}/assets/${id}.png`);
                }
            }

            for (const id in i.skillSprites) {
                const sprites = i.skillSprites[id];
                const sprite = sprites[sprites.length - 1];
                const filename = sprite.filename.replace("https://web.poecdn.com/image/passive-skill/", "");
                if (sprite && addedAssets.indexOf(filename) < 0) {
                    addedAssets.push(filename);
                    PIXI.Loader.shared.add(filename.replace("PassiveSkillScreen", ""), `${utils.SKILL_TREES_URI}/${i.patch}/assets/${filename}`);
                }
            }
        }
        // #endregion

        // #region Display Loading Bar
        const skillTreeData = filteredData[0];
        PIXI.Loader.shared.load();
        let loadedAssets = 0;
        const loadbarWidth = skillTreeData.width / 2;
        let progressText = "";
        PIXI.Loader.shared.onProgress.add(() => {
            loadedAssets++;
            const newText = `${Math.ceil(loadedAssets / addedAssets.length * 1000) / 10}%`;
            if (newText !== progressText) {
                this.viewport.removeChildren();
                progressText = newText;

                const loadbar = new PIXI.Graphics();
                loadbar.moveTo(0, 0);
                loadbar.beginFill(0xFFFFFF, .75);
                loadbar.lineStyle(2, 0xCBB59C)
                loadbar.drawRect(0, 0, (loadedAssets / addedAssets.length) * loadbarWidth, 50);
                loadbar.endFill();
                loadbar.position.set(-loadbarWidth / 2, screen.height / 2);
                this.viewport.addChild(loadbar);

                const text = new PIXI.Text(progressText, { fontSize: 250, fill: 0xFFFFFF });
                text.position.set(0, -50);
                this.viewport.addChild(text);
            }
        });
        // #endregion

        return promise;
    }

    protected DrawAsset = (layer: RenderLayer, asset: IAsset): { width: number, height: number } => {
        const container = this.GetLayer(layer);

        const sprite = PIXI.Sprite.from(asset.name);
        sprite.position.set(asset.x, asset.y);
        const offset = asset.offsetX === undefined ? .5 : asset.offsetX;
        sprite.anchor.set(offset, asset.offsetY);
        container.addChild(sprite);

        if (asset.half) {
            sprite.anchor.set(offset, 1);
            const sprite2 = PIXI.Sprite.from(asset.name);
            sprite2.rotation = Math.PI;
            sprite2.position.set(asset.x, asset.y);
            sprite2.anchor.set(offset, 1);
            container.addChild(sprite2);
        }

        this.SetLayer(layer, container);
        return { width: sprite.width, height: sprite.height * (asset.half ? 2 : 1) };
    }

    protected DrawText = (layer: RenderLayer, _text: string, colour: string, x: number, y: number): void => {
        const container = this.GetLayer(layer);

        const text = new PIXI.Text(_text, { fill: colour, fontSize: 48, fontFamily: "serif", fontStyle: "italic", stroke: 0x000000, strokeThickness: 4 });
        text.position.set(x, y);
        text.scale.set(this.skillTreeData.scale);
        container.addChild(text);

        this.SetLayer(layer, container);
    }

    protected DrawBackground = (layer: RenderLayer, asset: "AtlasPassiveBackground" | "Background2" | "Background1"): void => {
        const container = this.GetLayer(layer);

        let backgroundSprite: PIXI.Sprite = PIXI.Sprite.from(asset);
        if (asset === "AtlasPassiveBackground") {
            backgroundSprite.scale.set(2.8173)
            backgroundSprite.anchor.set(.504, .918);
        } else {
            const texture = backgroundSprite.texture;
            texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
            backgroundSprite = PIXI.TilingSprite.from(texture.baseTexture, { width: this.skillTreeData.width * (this.skillTreeData.scale * 1.25), height: this.skillTreeData.height * (this.skillTreeData.scale * 1.25) });
            backgroundSprite.anchor.set(.5);
        }

        container.addChild(backgroundSprite);
        this.SetLayer(layer, container);
    }

    protected DrawConnections = (layer: RenderLayer, connections: IConnnection[]): void => {
        const container = this.GetLayer(layer);

        const connectionContainer = new PIXI.Container();
        for (const connection of connections) {
            connectionContainer.addChild(this.DrawConnection(connection));
        }

        container.addChild(connectionContainer);
        this.SetLayer(layer, container);
    }

    private DrawConnection = (connection: IConnnection): PIXI.Container => {
        switch (connection.style) {
            case ConnectionStyle.Arc:
                return this.DrawArcConnection(connection);
            case ConnectionStyle.Line:
                return this.DrawLineConnection(connection);
        }
    }

    private DrawArcConnection = (connection: IConnnection): PIXI.Container => {
        const node = connection.node;
        const other = connection.other;

        let startAngle = node.arc < other.arc ? node.arc : other.arc;
        let endAngle = node.arc < other.arc ? other.arc : node.arc;

        const diff = endAngle - startAngle;
        if (diff >= Math.PI) {
            const c = 2 * Math.PI - diff;
            startAngle = endAngle;
            endAngle = startAngle + c;
        }
        startAngle -= Math.PI / 2;
        endAngle -= Math.PI / 2;

        let angle = endAngle - startAngle;
        const arcsNeeded = Math.ceil(angle / (Math.PI / 2));
        const initialRotation = Math.PI / 2 + startAngle;

        const arcContainer = new PIXI.Container();
        const texture = PIXI.Texture.from(connection.asset);
        for (let i = 0; i < arcsNeeded; ++i) {
            if (node.nodeGroup === undefined) {
                continue
            }

            const sprite = PIXI.Sprite.from(texture);
            sprite.rotation = angle + initialRotation;
            sprite.position.set(node.nodeGroup.x * node.scale, node.nodeGroup.y * node.scale);
            sprite.anchor.set(1);

            if (i == arcsNeeded - 1) {
                const mask = new PIXI.Graphics();
                mask.lineStyle(50 * node.scale, 0x00FF00);
                mask.arc(node.nodeGroup.x * node.scale, node.nodeGroup.y * node.scale, node.orbitRadii[node.orbit] * node.scale, startAngle, endAngle, false);

                sprite.mask = mask;
                arcContainer.addChild(mask);
            }

            arcContainer.addChild(sprite);

            if (connection.removing) {
                sprite.tint = 0xFF0000;
            }

            if (angle < Math.PI / 2) {
                continue
            }
            angle -= Math.PI / 2
        }

        return arcContainer;
    }

    private DrawLineConnection = (connection: IConnnection): PIXI.Sprite => {
        const node = connection.node;
        const other = connection.other;

        const texture = PIXI.Texture.from(connection.asset);
        texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;

        const length = Math.hypot(node.x - other.x, node.y - other.y);
        let line: PIXI.Sprite;
        if (length <= texture.baseTexture.width) {
            const lineTexure = new PIXI.Texture(texture.baseTexture, new PIXI.Rectangle(0, 0, length, texture.baseTexture.height));
            line = PIXI.Sprite.from(lineTexure);
        } else {
            line = PIXI.TilingSprite.from(texture.baseTexture, { width: length, height: texture.baseTexture.height });
        }
        line.anchor.set(0, 0.5);
        line.position.set(node.x, node.y);
        line.rotation = Math.atan2(other.y - node.y, other.x - node.x);

        if (connection.removing) {
            line.tint = 0xFF0000;
        }
        return line;
    }

    protected RenderBaseRest = (): void => {
        this.RenderBaseNodes();
    }

    private RenderBaseNodes = () => {
        const skillIcons: PIXI.Container = this.GetLayer(RenderLayer.SkillIcons);
        const skillIcons_compare: PIXI.Container = this.GetLayer(RenderLayer.SkillIconsCompare);

        for (const id in this.skillTreeData.nodes) {
            const node = this.skillTreeData.nodes[id];
            if (node.nodeGroup === undefined || node.classStartIndex !== undefined) {
                continue;
            }

            const icon = this.SkillNodeRenderer.CreateIcon(node);
            if (icon !== null) {
                skillIcons.addChild(icon);
            }

            const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => this.skillTreeData.nodes[x]).filter(x => x.classStartIndex === undefined));
            if (frame !== null) {
                skillIcons.addChild(frame);
            }
        }

        if (this.skillTreeDataCompare !== undefined) {
            for (const id in this.skillTreeDataCompare.nodes) {
                const node = this.skillTreeDataCompare.nodes[id];
                if (this.skillTreeData.nodes[node.GetId()] === undefined) {
                    this.skillTreeDataCompare.addState(node, SkillNodeStates.Compared);
                    const icon = this.SkillNodeRenderer.CreateIcon(node, "Compare")
                    if (icon !== null) {
                        skillIcons_compare.addChild(icon);
                    }
                    const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => (this.skillTreeDataCompare as SkillTreeData).nodes[x]));
                    if (frame !== null) {
                        skillIcons_compare.addChild(frame);
                    }
                }
            }
        }

        this.SetLayer(RenderLayer.SkillIcons, skillIcons);
        this.SetLayer(RenderLayer.SkillIconsCompare, skillIcons_compare);
    }

    protected RenderActiveRest = (): void => {
        const skillIconActiveEffects: PIXI.Container = this.GetLayer(RenderLayer.SkillIconsActiveEffects);
        const skillIconsActive: PIXI.Container = this.GetLayer(RenderLayer.SkillIconsActive);

        const activeNodes = this.skillTreeData.getNodes(SkillNodeStates.Active);
        for (const id in activeNodes) {
            const node = activeNodes[id];
            const nodes = node.out.map(x => this.skillTreeData.nodes[x]);

            const effect = this.SkillNodeRenderer.CreateIconEffect(node);
            if (effect !== null) {
                skillIconActiveEffects.addChild(effect);
            }

            for (const out of nodes) {
                const frame = this.SkillNodeRenderer.CreateFrame(out, out.in.map(x => this.skillTreeData.nodes[x]));
                if (frame !== null) {
                    skillIconsActive.addChild(frame);
                }
            }

            const icon = this.SkillNodeRenderer.CreateIcon(node);
            if (icon !== null) {
                skillIconsActive.addChild(icon);
            }
            const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => this.skillTreeData.nodes[x]));
            if (frame !== null) {
                skillIconsActive.addChild(frame);
            }
        }

        skillIconActiveEffects.interactive = false;
        skillIconActiveEffects.interactiveChildren = false;
        skillIconActiveEffects.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayer.SkillIconsActiveEffects, skillIconActiveEffects);

        skillIconsActive.interactive = false;
        skillIconsActive.interactiveChildren = false;
        skillIconsActive.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayer.SkillIconsActive, skillIconsActive);
    }

    protected RenderHoverRest = async (hovered: SkillNode): Promise<void> => {
        let atlasMasteryHighlight: PIXI.Container | undefined = undefined;
        const pathingSkillIcons: PIXI.Container = new PIXI.Container();

        const pathingNodes = this.skillTreeData.getHoveredNodes();
        for (const id in pathingNodes) {
            const node = pathingNodes[id];

            if (node.is(SkillNodeStates.Hovered)) {
                const icon = this.SkillNodeRenderer.CreateIcon(node);
                if (icon !== null) {
                    if (this.skillTreeData.tree === "Atlas" && node.isMastery) {
                        if (atlasMasteryHighlight === undefined) {
                            atlasMasteryHighlight = new PIXI.Container();
                        }
                        icon.scale.set(2.5);
                        atlasMasteryHighlight.addChild(icon);
                    } else {
                        pathingSkillIcons.addChild(icon);
                    }
                }
            }

            const frame = this.SkillNodeRenderer.CreateFrame(node, node.out.map(x => this.skillTreeData.nodes[x]));
            if (frame !== null) {
                pathingSkillIcons.addChild(frame);
            }
        }

        pathingSkillIcons.interactive = false;
        pathingSkillIcons.interactiveChildren = false;
        pathingSkillIcons.containerUpdateTransform = () => { };
        this.SetLayer(RenderLayer.SkillIconsPathing, pathingSkillIcons);

        if (atlasMasteryHighlight !== undefined) {
            atlasMasteryHighlight.interactive = false;
            atlasMasteryHighlight.interactiveChildren = false;
            atlasMasteryHighlight.containerUpdateTransform = () => { };
            this.SetLayer(RenderLayer.AtlasMasteryHighlight, atlasMasteryHighlight);
        }

        this.RenderTooltip(hovered);
    }

    private RenderTooltip = async (hovered: SkillNode): Promise<void> => {
        let tooltip: PIXI.Graphics | undefined = undefined;
        let tooltipCompare: PIXI.Graphics | undefined = undefined;

        const padding = 10;
        const text = this.SkillNodeRenderer.CreateTooltip(hovered, "Base");
        text.position.set(padding / 2, padding / 2);

        tooltip = new PIXI.Graphics();
        tooltip.beginFill(0x000000, .75);
        tooltip.lineStyle(2, 0xCBB59C)
        tooltip.drawRect(0, 0, text.width + padding, text.height + padding);
        tooltip.endFill();

        tooltip.addChild(text);

        let hoveredCompareNode: SkillNode | undefined = undefined;
        if (this.skillTreeDataCompare !== undefined) {
            const nodes = this.skillTreeDataCompare.getNodes(SkillNodeStates.Hovered);
            for (const id in nodes) {
                const node = nodes[id];
                if (node.nodeGroup === undefined) {
                    continue;
                }
                hoveredCompareNode = node;

                const padding = 10;
                const text = this.SkillNodeRenderer.CreateTooltip(node, "Compare");
                text.position.set(padding / 2, padding / 2);

                tooltipCompare = new PIXI.Graphics();
                tooltipCompare.beginFill(0x000000, .75);
                tooltipCompare.lineStyle(2, 0xFFB000)
                tooltipCompare.drawRect(0, 0, text.width + padding, text.height + padding);
                tooltipCompare.endFill();

                tooltipCompare.addChild(text);
            }
        }

        if (tooltip === undefined && tooltipCompare !== undefined && hoveredCompareNode !== undefined) {
            tooltip = tooltipCompare;
            hovered = hoveredCompareNode;

            tooltipCompare = undefined;
            hoveredCompareNode = undefined;
        }

        if (tooltip !== undefined) {
            tooltip.interactive = false;
            tooltip.interactiveChildren = false;
            tooltip.containerUpdateTransform = () => { };
            this.SetLayer(RenderLayer.Tooltip, tooltip);
        }

        if (tooltipCompare !== undefined) {
            tooltipCompare.interactive = false;
            tooltipCompare.interactiveChildren = false;
            tooltipCompare.containerUpdateTransform = () => { };
            this.SetLayer(RenderLayer.TooltipCompare, tooltipCompare);
        }

        if (tooltip !== undefined && hovered !== undefined) {
            const bounds = tooltip.getBounds();
            const size = hovered.GetTargetSize();
            const scaleX = tooltip.width / bounds.width / devicePixelRatio;
            const scaleY = tooltip.height / bounds.height / devicePixelRatio;

            if (tooltip.worldTransform.tx + bounds.width > screen.width) {
                tooltip.x = hovered.x - tooltip.width * scaleX - size.width;
            } else {
                tooltip.x = hovered.x + size.width;
            }

            if (tooltip.worldTransform.ty + bounds.height > screen.height) {
                tooltip.y = hovered.y - tooltip.height * scaleY + size.height / 2;
            } else {
                tooltip.y = hovered.y - size.height / 2;
            }

            tooltip.scale.set(scaleX, scaleY);

            if (tooltipCompare !== undefined && hoveredCompareNode !== undefined) {
                const boundsCompare = tooltipCompare.getBounds();

                tooltipCompare.y = tooltip.y;
                tooltipCompare.x = tooltip.x + tooltip.width;

                tooltipCompare.scale.set(tooltipCompare.width / boundsCompare.width / devicePixelRatio, tooltipCompare.height / boundsCompare.height / devicePixelRatio);
            }
        }
    }

    protected DrawHighlights = (layer: RenderLayer, highlights: IHighlight[]): void => {
        const container = this.GetLayer(layer);

        for (var highlight of highlights) {
            const size = highlight.node.GetTargetSize();
            if (size.width === 0 || size.height === 0) {
                continue;
            }

            const graphic = new PIXI.Graphics();
            graphic.beginFill(0x000000, 0);
            graphic.lineStyle(5, highlight.color);
            graphic.drawCircle(0, 0, Math.max(size.width, size.height) * .85);
            graphic.endFill();
            graphic.position.set(highlight.node.x, highlight.node.y);
            container.addChild(graphic);
        }

        this.SetLayer(layer, container);
    }

    public CreateScreenshot = (mimeType: 'image/jpeg' | 'image/webp'): string => {
        return this.pixi.renderer.plugins.extract.base64(this.viewport, mimeType, 1);
    }
}