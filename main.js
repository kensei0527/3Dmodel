// モデルとアニメーションを管理するクラス
class ModelAnimationController {
    constructor() {
        this.scene = new THREE.Scene();
        // カメラの視野角を狭めてモデルを大きく見せる
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.mixer = null;
        this.animations = {};
        this.idleAnimation = null;
        this.currentExpression = null;

        // ▼追加: 表情補間用のデータを保持するオブジェクト
        this.currentExpressionInfluences = {};
        this.targetExpressionInfluences = {};
        this.transitionStartTime = null;
        this.transitionDuration = 1.0; // 表情変化にかける時間(1秒)
        
        this.init();
    }

    init() {
        // レンダラーの設定
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        // トーンマッピングの露出を上げて明るく
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.7;
        document.body.appendChild(this.renderer.domElement);

        // カメラをより近づける
        this.camera.position.z = 2;

        // 照明の強化
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
        mainLight.position.set(1, 2, 2);
        this.scene.add(mainLight);

        const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
        frontLight.position.set(0, 0, 2);
        this.scene.add(frontLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
        backLight.position.set(0, 0, -2);
        this.scene.add(backLight);

        window.addEventListener('resize', () => this.onWindowResize(), false);

        // 背景色を明るく
        //this.scene.background = new THREE.Color(0xcccccc);
    }

    async loadModel(url) {
        const loader = new THREE.GLTFLoader();
        
        try {
            const gltf = await new Promise((resolve, reject) => {
                loader.load(url, resolve, undefined, reject);
            });

            const model = gltf.scene;

            model.traverse((node) => {
                if (node.isMesh) {
                    if (node.material) {
                        node.material.skinning = true;
                        node.material.morphTargets = true;
                        
                        // マテリアルの明るさを調整
                        if (node.material.emissive) {
                            node.material.emissive.setHex(0x000000);
                        }
                        // 環境マップの影響を強化
                        if (node.material.envMapIntensity !== undefined) {
                            node.material.envMapIntensity = 1.5;
                        }

                        // transparentなマテリアルならalphaTestを初期化
                        if (node.material.transparent) {
                            node.material.alphaTest = 0.5; // 初期値は0.5
                        }

                        if (node.material.map) {
                            node.material.map.encoding = THREE.sRGBEncoding;
                            node.material.map.flipY = false;
                        }

                        node.material.needsUpdate = true;
                    }

                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            // モデルのスケールを調整
            model.scale.set(1.5, 1.5, 1.5);

            // モデルの位置を少し上げる
            model.position.y = -2.2;

            this.scene.add(model);

            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.physicallyCorrectLights = true;

            this.mixer = new THREE.AnimationMixer(model);

            gltf.animations.forEach(clip => {
                this.animations[clip.name] = clip;
            });

            const idleAnimationName = "Armature.003|mixamo.com|Layer0.001";
            if (this.animations[idleAnimationName]) {
                this.idleAnimation = this.mixer.clipAction(this.animations[idleAnimationName]);
                this.idleAnimation.play();
            }

            return model;
        } catch (error) {
            console.error('モデルのロード中にエラーが発生しました:', error);
            throw error;
        }
    }

    // 表情の変更
    // ▼修正: 表情をスムーズに変化させるメソッド
    changeExpressionSmooth(expressionType, duration = 0.5) {
        const expressionMap = {
            'neutral': 'Fcl_ALL_Neutral',
            'angry': 'Fcl_ALL_Angry',
            'fun': 'Fcl_ALL_Fun',
            'joy': 'Fcl_ALL_Joy',
            'sorrow': 'Fcl_ALL_Sorrow'
        };

        const morphTargetName = expressionMap[expressionType];
        if (!morphTargetName) {
            console.warn(`表情 "${expressionType}" が見つかりません`);
            return;
        }

        this.transitionDuration = duration;
        this.transitionStartTime = performance.now();

        // 現在値とターゲット値を記録
        this.scene.traverse((node) => {
            if (node.morphTargetDictionary && node.morphTargetInfluences) {
                const index = node.morphTargetDictionary[morphTargetName];
                if (index !== undefined) {
                    const currentValues = node.morphTargetInfluences.slice();
                    const newValues = new Array(currentValues.length).fill(0);
                    newValues[index] = 1.0;

                    this.currentExpressionInfluences[node.uuid] = currentValues;
                    this.targetExpressionInfluences[node.uuid] = newValues;
                }
            }
        });
    }

    // 現在のchangeExpressionは不使用または中身をコメントアウト
    changeExpression(expressionType) {
        console.warn("changeExpressionは使わず、changeExpressionSmoothを使ってください。");
        // 瞬間的に変える場合は下記を使用：
        /*
        const expressionMap = {
            'neutral': 'Fcl_ALL_Neutral',
            'angry': 'Fcl_ALL_Angry',
            'fun': 'Fcl_ALL_Fun',
            'joy': 'Fcl_ALL_Joy',
            'sorrow': 'Fcl_ALL_Sorrow'
        };

        const morphTargetName = expressionMap[expressionType];
        if (!morphTargetName) {
            console.warn(`表情 "${expressionType}" が見つかりません`);
            return;
        }

        this.scene.traverse((node) => {
            if (node.morphTargetDictionary && node.morphTargetInfluences) {
                const index = node.morphTargetDictionary[morphTargetName];
                if (index !== undefined) {
                    node.morphTargetInfluences.fill(0);
                    node.morphTargetInfluences[index] = 1;
                }
            }
        });
        */
    }


    // AlphaTest値を変更するメソッドを追加
    setAlphaTest(value) {
        // シーンをトラバースして、マテリアルがあるかつtransparentなもののみ値を変更
        this.scene.traverse((node) => {
            if (node.isMesh && node.material) {
                if (node.material.transparent === true) {
                    node.material.alphaTest = value;
                    node.material.needsUpdate = true;
                }
            }
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // ▼追加: スムーズな表情補間処理
        if (this.transitionStartTime !== null) {
            const elapsed = (performance.now() - this.transitionStartTime) / 1000;
            const t = Math.min(elapsed / this.transitionDuration, 1.0);

            this.scene.traverse((node) => {
                if (node.morphTargetDictionary && node.morphTargetInfluences) {
                    const startValues = this.currentExpressionInfluences[node.uuid];
                    const endValues = this.targetExpressionInfluences[node.uuid];
                    if (startValues && endValues) {
                        for (let i = 0; i < node.morphTargetInfluences.length; i++) {
                            node.morphTargetInfluences[i] = startValues[i] + (endValues[i] - startValues[i]) * t;
                        }
                    }
                }
            });

            if (t === 1.0) {
                this.transitionStartTime = null;
            }
        }


        if (this.mixer) {
            this.mixer.update(0.016);
        }

        this.renderer.render(this.scene, this.camera);
    }
}