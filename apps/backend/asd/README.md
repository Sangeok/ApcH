# LR-ASD: Lightweight and Robust Network for Active Speaker Detection


This repository contains the code and model weights for the [extended version](https://junhua-liao.github.io/Junhua-Liao/publications/papers/IJCV_2025.pdf) (IJCV 2025) of our conference publication ([A Light Weight Model for Active Speaker Detection](https://openaccess.thecvf.com/content/CVPR2023/papers/Liao_A_Light_Weight_Model_for_Active_Speaker_Detection_CVPR_2023_paper.pdf), CVPR 2023, [code](https://github.com/Junhua-Liao/Light-ASD)):

> LR-ASD: Lightweight and Robust Network for Active Speaker Detection  
> Junhua Liao, Haihan Duan, Kanghui Feng, Wanbing Zhao, Yanbing Yang, Liangyin Chen, Yanru Chen


***
### Evaluate on AVA-ActiveSpeaker dataset 

#### Data preparation
Use the following code to download and preprocess the AVA dataset.
```
python train.py --dataPathAVA AVADataPath --download 
```
The AVA dataset and the labels will be downloaded into `AVADataPath`.

#### Training
You can train the model on the AVA dataset by using:
```
python train.py --dataPathAVA AVADataPath
```
`exps/exps1/score.txt`: output score file, `exps/exp1/model/model_00xx.model`: trained model, `exps/exps1/val_res.csv`: prediction for val set.

#### Testing
Our model weights have been placed in the `weight` folder. It performs `mAP: 94.45%` in the validation set. You can check it by using: 
```
python train.py --dataPathAVA AVADataPath --evaluation
```


***
### Evaluate on Columbia ASD dataset

#### Testing
The model weights trained on the AVA dataset have been placed in the `weight` folder. Then run the following code.
```
python Columbia_test.py --evalCol --colSavePath colDataPath
```
The Columbia ASD dataset and the labels will be downloaded into `colDataPath`. And you can get the following F1 result.
| Name |  Bell  |  Boll  |  Lieb  |  Long  |  Sick  |  Avg.  |
|----- | ------ | ------ | ------ | ------ | ------ | ------ |
|  F1  |  88.8% |  77.9% |  90.3% |  85.4% |  88.3% |  86.1% |

We have also provided the model weights fine-tuned on the TalkSet dataset.
```
python Columbia_test.py --evalCol --pretrainModel weight/finetuning_TalkSet.model --colSavePath colDataPath
```
You can get the following result.
| Name |  Bell  |  Boll  |  Lieb  |  Long  |  Sick  |  Avg.  |
|----- | ------ | ------ | ------ | ------ | ------ | ------ |
|  F1  |  96.9% |  89.4% |  97.6% |  99.0% |  99.2% |  96.4% |


***
### An ASD Demo with pretrained LR-ASD model
You can put the raw video (`.mp4` and `.avi` are both fine) into the `demo` folder, such as `0001.mp4`. 
```
python Columbia_test.py --videoName 0001 --videoFolder demo
```
By default, the model loads weights trained on the AVA-ActiveSpeaker dataset. If you want to load weights fine-tuned on TalkSet, you can execute the following code.
```
python Columbia_test.py --videoName 0001 --videoFolder demo --pretrainModel weight/finetuning_TalkSet.model
```
You can obtain the output video `demo/0001/pyavi/video_out.avi`, where the active speaker is marked by a green box and the non-active speaker by a red box.


***
### Citation

Please cite our papers if you use this code or model weights. 

```
@InProceedings{Liao_2023_CVPR,
    title     = {A Light Weight Model for Active Speaker Detection},
    author    = {Liao, Junhua and Duan, Haihan and Feng, Kanghui and Zhao, Wanbing and Yang, Yanbing and Chen, Liangyin},
    booktitle = {Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)},
    month     = {June},
    year      = {2023},
    pages     = {22932-22941}
}
```
```
@article{Liao_2025_IJCV,
  title     = {LR-ASD: Lightweight and Robust Network for Active Speaker Detection},
  author    = {Liao, Junhua and Duan, Haihan and Feng, Kanghui and Zhao, Wanbing and Yang, Yanbing and Chen, Liangyin and Chen, Yanru},
  journal   = {International Journal of Computer Vision},
  pages     = {1--21},
  year      = {2025},
  publisher = {Springer}
}
```


***
### Acknowledgments
Thanks for the support of TaoRuijie's open source [repository](https://github.com/TaoRuijie/TalkNet-ASD) for this research.
