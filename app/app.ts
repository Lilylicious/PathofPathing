﻿import { SkillTreeData } from "../models/SkillTreeData";
import { Utils } from "./utils";
import * as PIXI from "pixi.js";;
import * as Viewport from "pixi-viewport";

namespace App {
    let skillTreeData: SkillTreeData;
    let pixi: PIXI.Application;
    let viewport: Viewport;
    export const main = async () => {
        skillTreeData = new SkillTreeData(await $.ajax({
            url: `/data/SkillTree.json?t=${(new Date()).getTime()}`,
            dataType: 'json'
        }));

        pixi = new PIXI.Application(window.innerWidth, window.innerHeight, {
            autoResize: true,
            resolution: devicePixelRatio,
            antialias: true
        });
        document.body.appendChild(pixi.view);

        viewport = new Viewport({
            screenWidth: pixi.screen.width,
            screenHeight: pixi.screen.height,
            worldWidth: skillTreeData.width,
            worldHeight: skillTreeData.height,
            interaction: pixi.renderer.plugins.interaction
        });
        viewport
            .drag()
            .wheel({ smooth: 3 })
            .pinch();

        pixi.stage.addChild(viewport);

        $(window).on("resize", () => {
            pixi.renderer.resize(window.innerWidth, window.innerHeight);
            viewport.resize(pixi.renderer.width, pixi.renderer.height, skillTreeData.width, skillTreeData.height);
        });
        draw();
    }


    export const events = () => {
        viewport.on('clicked', () => console.log('clicked'))
        viewport.on('drag-start', () => console.log('drag-start'))
        viewport.on('drag-end', () => console.log('drag-end'))
        viewport.on('pinch-start', () => console.log('pinch-start'))
        viewport.on('pinch-end', () => console.log('pinch-end'))
        viewport.on('snap-start', () => console.log('snap-start'))
        viewport.on('snap-end', () => console.log('snap-end'))
        viewport.on('snap-zoom-start', () => console.log('snap-zoom-start'))
        viewport.on('snap-zoom-end', () => console.log('snap-zoom-end'))
        viewport.on('moved-end', () => console.log('moved-end'))
        viewport.on('zoomed-end', () => console.log('zoomed-end'))
    }

    export const draw = (): void => {
        viewport.removeChildren();
        //we like the highest res images
        var max_zoom = skillTreeData.imageZoomLevels[skillTreeData.imageZoomLevels.length - 1];
        //Draw background first

        // Draw connections second
        for (let id in skillTreeData.nodes) {
            var node = skillTreeData.nodes[id];
            if (node.spc.length === 0) {
                viewport.addChild(node.getGraphic());
            }
            for (let graphic of node.getGraphicConnections(skillTreeData.nodes)) {
                viewport.addChild(graphic);
            }
        }

        //draw skill icons third
        for (let id in skillTreeData.nodes) {
            var node = skillTreeData.nodes[id];
            if (node.spc.length === 0) {
                viewport.addChild(node.getGraphic());
            }
        }

        //draw faces forth
        for (let id of skillTreeData.root.out) {
            let node = skillTreeData.nodes[id];
            if (node.spc.length !== 1) {
                // Root node with no/multiple classes?
                continue;
            }

            let class_name = Utils.getKeyByValue(skillTreeData.constants.classes, node.spc[0]);
            if (class_name === undefined) {
                throw new Error(`Couldn't find class name from constants: ${node.spc[0]}`);
            }

            let class_name_backgrouds = skillTreeData.assets[`Background${class_name.replace("Class", "")}`];
            let class_name_backgroud = "";
            if (class_name_backgrouds) {
                if (max_zoom in class_name_backgrouds) {
                    class_name_backgroud = class_name_backgrouds[max_zoom];
                } else {
                    class_name_backgroud = class_name_backgrouds[0];
                }
                let class_file_name = class_name_backgroud.slice(class_name_backgroud.lastIndexOf('/') + 1);
                let class_url = `data/assets/Background${class_name.replace("Class", "").toLocaleLowerCase()}${class_file_name.slice(class_file_name.lastIndexOf('.'))}`;
                let class_node_graphic = PIXI.Sprite.fromImage(class_url);
                class_node_graphic.anchor.set(.6, .4)
                //node_graphic.scale.set(3);
                class_node_graphic.x = node.group.x / 2.75;
                class_node_graphic.y = node.group.y / 2.75;
                //viewport.addChild(class_node_graphic);
            }

            let common_name = skillTreeData.constants.classesToName[class_name];

            //find center
            //TODO: make asset loader
            let class_backgrounds = skillTreeData.assets[`center${common_name.toLocaleLowerCase()}`];
            let class_background = "";
            if (class_backgrounds) {
                if (max_zoom in class_backgrounds) {
                    class_background = class_backgrounds[max_zoom];
                } else {
                    class_background = class_backgrounds[0];
                }
                //get file name
                let file_name = class_background.slice(class_background.lastIndexOf('/') + 1);
                let node_url = `data/assets/center${common_name.toLocaleLowerCase()}${file_name.slice(file_name.lastIndexOf('.'))}`;
                let node_graphic = PIXI.Sprite.fromImage(node_url);
                node_graphic.anchor.set(.5)
                //node_graphic.scale.set(3);
                node_graphic.x = node.x;
                node_graphic.y = node.y;
                viewport.addChild(node_graphic);
                //viewport.addChild(node.getGraphic());
            }
        }
    }
}

$(window).on("load", () => {
    App.main();
});