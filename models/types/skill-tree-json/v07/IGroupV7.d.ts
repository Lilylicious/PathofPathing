﻿interface IGroupV7 extends Omit<IGroupV1, 'oo' | 'n'>{
    /** x-coordinate of the group */
    x: number;

    /** y-coordinate of the group */
    y: number;

    /** Determines if the group is a proxy (cluster jewel) */
    isProxy: boolean;

    /** The Orbitals (i.e. SkillNode.oidx) associated with the nodes attached to the group */
    orbits: Array<number>;

    /** A list of SkillNodes by Id */
    nodes: Array<string>;
} 