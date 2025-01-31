import {
  Map,
  addProtocol,
  RequestParameters,
  Source,
} from "maplibre-gl";

// @ts-ignore
import TileWorker from "./tile-worker?worker&inline";

const CREPUSCULE_PROTOCOL_NAMESPACE_PATTERN = "crepuscule_protocole_<UNIQUE>";
const CREPUSCULE_SOURCE_ID_PATTERN = "crepuscule_source_<UNIQUE>";
const CREPUSCULE_LAYER_ID_PATTERN = "crepuscule_layer_<UNIQUE>";

export type Color = [number, number, number];

export type CrepusculeOptions = {
  color?: Color;
  opacity?: number;
  date?: Date;
  debug?: boolean;
};

export type TransitionOptions = {
  duration?: number;
  delay?: number;
};

const defaultOptions: CrepusculeOptions = {
  color: [0, 0, 17],
  opacity: 0.7,
  date: new Date(),
  debug: false,
};

export class Crepuscule {
  private map: Map;
  private color: Color;
  private opacity: number;
  private date: Date;
  private unique: string;
  private protocolNamespace: string;
  private tileUriPattern: string;
  private layerId: string;
  private sourceId: string;
  private debug: boolean;
  private source!: Source;
  private wasUnmounted = false;

  constructor(map: Map, options: CrepusculeOptions = {}) {
    const optionsWithDefault: CrepusculeOptions = {
      ...defaultOptions,
      ...options,
    };

    this.map = map;
    this.color = (optionsWithDefault.color as Color).slice() as Color;
    this.opacity = optionsWithDefault.opacity as number;
    this.date = optionsWithDefault.date as Date;
    this.debug = optionsWithDefault.debug as boolean;

    this.unique = (Math.random() + 1).toString(36).substring(2);
    this.protocolNamespace = CREPUSCULE_PROTOCOL_NAMESPACE_PATTERN.replace(
      "<UNIQUE>",
      this.unique
    );
    this.tileUriPattern = `${this.protocolNamespace}://{z}-{x}-{y}-${+this
      .date}`;
    this.layerId = CREPUSCULE_LAYER_ID_PATTERN.replace("<UNIQUE>", this.unique);
    this.sourceId = CREPUSCULE_SOURCE_ID_PATTERN.replace(
      "<UNIQUE>",
      this.unique
    );

    // Init of wait for init
    if (map?.loaded()) {
      this.init();
    } else {
      map.on("load", () => {
        this.init();
      });
    }
  }

  private async generateTilePixelOnWorker(
    x: number,
    y: number,
    z: number,
    timestamp: number
  ) {
    return new Promise((resolve) => {
      const tileWorker = new TileWorker();
      tileWorker.postMessage({
        x,
        y,
        z,
        timestamp,
        color: this.color,
        debug: this.debug,
      });

      tileWorker.onmessage = (evt: MessageEvent<any>) => {
        resolve(evt.data);
        tileWorker.terminate();
      };
    });
  }

  private init() {
    // Adding the protocole
    addProtocol(
      this.protocolNamespace,
      async (
        params: RequestParameters
      ): Promise<any> => {
        if (!params.url) throw new Error("");

        const [z, x, y, timestamp] = (
          (params.url.split("/") as Array<string>).pop() as string
        )
          .split("-")
          .map((el: string): number => parseFloat(el));

        const arrbuff = await this.generateTilePixelOnWorker(x, y, z, timestamp).then((arrbuff) => {
          return arrbuff
        });
        if (arrbuff) {
          return { data: arrbuff }
        }
        return { cancel: () => { } };
      }
    );

    // Adding the source
    this.map.addSource(this.sourceId, {
      type: "raster",
      tiles: [this.tileUriPattern],
      tileSize: 512,
    });

    this.source = this.map.getSource(this.sourceId) as Source;

    // adding the layer
    this.map.addLayer({
      id: this.layerId,
      type: "raster",
      source: this.sourceId,
      paint: {
        // @ts-ignore
        "raster-opacity-transition": { duration: 1000, delay: 0 },
        "raster-opacity": this.opacity,
      },
    });
  }

  setOpacity(o: number, options: TransitionOptions = {}) {
    this.raiseIfUnmounted();
    this.opacity = o;
    this.map.setPaintProperty(this.layerId, "raster-opacity-transition", {
      duration: 0,
      delay: 0,
      ...options,
    });
    this.map.setPaintProperty(this.layerId, "raster-opacity", o, {
      validate: false,
    });
  }

  hide(options: TransitionOptions = {}) {
    this.raiseIfUnmounted();
    this.setOpacity(0, options);
  }

  show(options: TransitionOptions = {}) {
    this.raiseIfUnmounted();
    this.setOpacity(this.opacity, options);
  }

  setDate(date: Date) {
    this.raiseIfUnmounted();
    this.date = date;
    this.tileUriPattern = `${this.protocolNamespace}://{z}-{x}-{y}-${+this
      .date}`;
    // @ts-ignore
    this.source.tiles[0] = this.tileUriPattern;
    // @ts-ignore
    this.source.load();
  }

  update() {
    this.raiseIfUnmounted();
    this.setDate(new Date());
  }

  unmount() {
    this.raiseIfUnmounted();
    this.map.removeLayer(this.layerId);
    this.map.removeSource(this.sourceId);
    this.wasUnmounted = true;
  }

  private raiseIfUnmounted() {
    if (this.wasUnmounted) {
      throw new Error(
        "This Crepuscule instance was unmounted and can no longer be used."
      );
    }
  }
}

export class CrepusculeLive {
  private opacity: number;
  private crA: Crepuscule;
  private crB: Crepuscule;
  private usingA: boolean;
  private intervalId!: any;
  private map!: Map;

  constructor(map: Map, options: CrepusculeOptions = {}) {
    const optionsWithDefault = {
      ...defaultOptions,
      ...options,
    };

    this.map = map;
    this.opacity = optionsWithDefault.opacity as number;

    if (optionsWithDefault.debug) {
      this.crA = new Crepuscule(map, {
        ...optionsWithDefault,
        color: [70, 0, 0],
      });
      this.crB = new Crepuscule(map, {
        ...optionsWithDefault,
        opacity: 0,
        color: [0, 0, 70],
      });
    } else {
      this.crA = new Crepuscule(map, optionsWithDefault);
      this.crB = new Crepuscule(map, { ...optionsWithDefault, opacity: 0 });
    }

    this.usingA = true;
    this.intervalId = null;

    if (map?.loaded()) {
      this.start();
    } else {
      map.once("load", () => {
        this.start();
      });
    }
  }

  start() {
    this.intervalId = setInterval(() => {
      this._update();
    }, 5000);
  }

  stop() {
    // @ts-ignore
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  _update() {
    const toHide = this.usingA ? this.crA : this.crB;
    const toShow = this.usingA ? this.crB : this.crA;
    this.usingA = !this.usingA;

    toShow.setDate(new Date());

    // Wait some time to make sure the tiles are created
    toHide.setOpacity(0, { duration: 0, delay: 1000 });
    toShow.setOpacity(this.opacity, { duration: 0, delay: 1000 });

    // This is necessary for refreshing the layer rendering even when the
    // browser window is out of focus
    this.map.triggerRepaint();
  }

  unmount() {
    this.stop();
    this.crA.unmount();
    this.crB.unmount();
  }
}

// TODO: add the unmount
